"""
Production ETL Pipeline: Financial Data Warehouse
==================================================
Extracts raw transaction feeds, cleans/validates records, normalizes vendor entities,
computes automated anomaly scores (Modified Z-Score), models into a Kimball Star Schema,
and loads into an embedded SQLite/DuckDB OLAP data warehouse.
"""

import csv
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple


class FinancialETLPipeline:
    def __init__(self, raw_csv_path: str, db_output_path: str):
        self.raw_csv_path = Path(raw_csv_path)
        self.db_output_path = Path(db_output_path)
        self.conn = None

    def initialize_database(self):
        """Initializes Star Schema tables in SQLite."""
        self.conn = sqlite3.connect(self.db_output_path)
        cursor = self.conn.cursor()

        # Execute Star Schema DDL
        cursor.executescript("""
        PRAGMA foreign_keys = ON;

        DROP TABLE IF EXISTS fact_transactions;
        DROP TABLE IF EXISTS dim_payment_method;
        DROP TABLE IF EXISTS dim_merchant;
        DROP TABLE IF EXISTS dim_category;
        DROP TABLE IF EXISTS dim_date;

        CREATE TABLE dim_date (
            date_key INTEGER PRIMARY KEY,
            full_date TEXT NOT NULL,
            day_of_week_num INTEGER NOT NULL,
            day_name TEXT NOT NULL,
            is_weekend INTEGER NOT NULL,
            week_of_year INTEGER NOT NULL,
            month_num INTEGER NOT NULL,
            month_name TEXT NOT NULL,
            quarter TEXT NOT NULL,
            year INTEGER NOT NULL
        );

        CREATE TABLE dim_category (
            category_id TEXT PRIMARY KEY,
            category_name TEXT NOT NULL,
            category_type TEXT NOT NULL,
            budget_cap REAL DEFAULT 0.0,
            is_discretionary INTEGER DEFAULT 1
        );

        CREATE TABLE dim_merchant (
            merchant_id TEXT PRIMARY KEY,
            merchant_name TEXT NOT NULL,
            clean_merchant_name TEXT NOT NULL,
            is_subscription INTEGER DEFAULT 0
        );

        CREATE TABLE dim_payment_method (
            payment_method_id TEXT PRIMARY KEY,
            payment_method_name TEXT NOT NULL,
            channel_type TEXT NOT NULL
        );

        CREATE TABLE fact_transactions (
            transaction_id TEXT PRIMARY KEY,
            date_key INTEGER NOT NULL,
            category_id TEXT NOT NULL,
            merchant_id TEXT NOT NULL,
            payment_method_id TEXT NOT NULL,
            transaction_type TEXT NOT NULL,
            amount REAL NOT NULL,
            is_recurring INTEGER DEFAULT 0,
            is_anomaly INTEGER DEFAULT 0,
            anomaly_score REAL DEFAULT 0.0,
            notes TEXT,
            FOREIGN KEY (date_key) REFERENCES dim_date(date_key),
            FOREIGN KEY (category_id) REFERENCES dim_category(category_id),
            FOREIGN KEY (merchant_id) REFERENCES dim_merchant(merchant_id),
            FOREIGN KEY (payment_method_id) REFERENCES dim_payment_method(payment_method_id)
        );
        """)
        self.conn.commit()
        print(f"Initialized database tables at {self.db_output_path}")

    @staticmethod
    def clean_merchant_string(raw_merchant: str) -> Tuple[str, bool]:
        """
        Regex Entity Normalization: Strips store numbers, payment gateway flags,
        and trailing location noise (e.g. 'AMZN Mktp US*9281A' -> 'Amazon').
        """
        raw = raw_merchant.strip()
        is_subscription = False

        if re.search(r"netflix", raw, re.I):
            return "Netflix", True
        if re.search(r"spotify", raw, re.I):
            return "Spotify", True
        if re.search(r"at&t|verizon|spectrum", raw, re.I):
            return re.sub(r"\s+(mobility|wireless|internet|fiber).*", "", raw, flags=re.I).strip(), True
        if re.search(r"amzn|amazon", raw, re.I):
            return "Amazon", False
        if re.search(r"trader joe", raw, re.I):
            return "Trader Joe's", False
        if re.search(r"whole foods", raw, re.I):
            return "Whole Foods Market", False
        if re.search(r"target", raw, re.I):
            return "Target", False
        if re.search(r"apple", raw, re.I):
            return "Apple", False
        if re.search(r"chevron|shell", raw, re.I):
            return re.sub(r"\s+\d+.*", "", raw).strip(), False
        if re.search(r"uber|lyft", raw, re.I):
            return re.sub(r"[\*].*", "", raw).strip(), False

        # Generic cleanup: remove store numbers (#123) and asterisks
        clean = re.sub(r"[#\*]\S+", "", raw)
        clean = re.sub(r"\s+", " ", clean).strip()
        return clean, is_subscription

    def run_pipeline(self):
        """Executes full ETL cycle."""
        if not self.raw_csv_path.exists():
            raise FileNotFoundError(f"Raw CSV not found at {self.raw_csv_path}")

        self.initialize_database()

        with open(self.raw_csv_path, mode="r", encoding="utf-8") as f:
            reader = list(csv.DictReader(f))

        print(f"Extracted {len(reader)} rows from CSV. Processing dimensional staging...")

        dim_date_records = {}
        dim_category_records = {}
        dim_merchant_records = {}
        dim_pm_records = {}
        fact_rows = []

        # Category budgets configuration
        category_budgets = {
            "cat_food_dining": 650.0,
            "cat_housing_rent": 1500.0,
            "cat_transportation": 250.0,
            "cat_utilities_bills": 200.0,
            "cat_entertainment": 180.0,
            "cat_shopping": 300.0,
            "cat_healthcare": 150.0,
            "cat_travel": 400.0,
            "cat_education": 100.0,
            "cat_other_exp": 120.0
        }

        # Step 1: Collect Category Spend Vectors to calculate statistical anomaly thresholds
        category_amounts: Dict[str, List[float]] = {}
        for r in reader:
            if r["transaction_type"] == "expense":
                cat = r["category_id"]
                val = float(r["amount"])
                category_amounts.setdefault(cat, []).append(val)

        # Precompute Median and MAD (Median Absolute Deviation) per category
        category_stats = {}
        for cat, amounts in category_amounts.items():
            sorted_amt = sorted(amounts)
            n = len(sorted_amt)
            median = sorted_amt[n // 2] if n % 2 != 0 else (sorted_amt[n // 2 - 1] + sorted_amt[n // 2]) / 2.0
            deviations = sorted([abs(x - median) for x in sorted_amt])
            mad = deviations[n // 2] if n % 2 != 0 else (deviations[n // 2 - 1] + deviations[n // 2]) / 2.0
            if mad == 0:
                mad = 1.0  # prevent division by zero
            category_stats[cat] = {"median": median, "mad": mad}

        # Step 2: Transform & populate dimensions and fact
        for row in reader:
            dt = datetime.strptime(row["date"], "%Y-%m-%d")
            date_key = int(dt.strftime("%Y%m%d"))

            # Populate dim_date
            if date_key not in dim_date_records:
                dim_date_records[date_key] = (
                    date_key,
                    row["date"],
                    dt.isoweekday(),
                    dt.strftime("%A"),
                    1 if dt.weekday() >= 5 else 0,
                    dt.isocalendar()[1],
                    dt.month,
                    dt.strftime("%B"),
                    f"Q{(dt.month - 1) // 3 + 1}",
                    dt.year
                )

            # Populate dim_category
            cat_id = row["category_id"]
            if cat_id not in dim_category_records:
                is_disc = 0 if cat_id in ["cat_housing_rent", "cat_utilities_bills", "cat_healthcare", "cat_salary"] else 1
                budget = category_budgets.get(cat_id, 0.0)
                dim_category_records[cat_id] = (
                    cat_id,
                    row["category_name"],
                    row["transaction_type"],
                    budget,
                    is_disc
                )

            # Populate dim_merchant
            clean_name, is_sub = self.clean_merchant_string(row["merchant"])
            merch_slug = "merch_" + re.sub(r"[^a-z0-9]", "", clean_name.lower())[:16]
            if merch_slug not in dim_merchant_records:
                dim_merchant_records[merch_slug] = (
                    merch_slug,
                    row["merchant"],
                    clean_name,
                    1 if (is_sub or int(row.get("is_recurring", 0)) == 1) else 0
                )

            # Populate dim_payment_method
            pm_name = row["payment_method"]
            pm_id = "pm_" + re.sub(r"[^a-z0-9]", "", pm_name.lower())[:16]
            if pm_id not in dim_pm_records:
                dim_pm_records[pm_id] = (
                    pm_id,
                    pm_name,
                    "card" if "Card" in pm_name else ("bank" if "Bank" in pm_name else "wallet")
                )

            # Anomaly scoring: Modified Z-Score
            amount = float(row["amount"])
            anomaly_score = 0.0
            is_anomaly = 0
            if row["transaction_type"] == "expense" and cat_id in category_stats:
                stat = category_stats[cat_id]
                anomaly_score = round(0.6745 * (amount - stat["median"]) / stat["mad"], 2)
                if anomaly_score > 3.0:
                    is_anomaly = 1

            fact_rows.append((
                row["transaction_id"],
                date_key,
                cat_id,
                merch_slug,
                pm_id,
                row["transaction_type"],
                amount,
                int(row.get("is_recurring", 0)),
                is_anomaly,
                anomaly_score,
                row.get("notes", "")
            ))

        # Step 3: Bulk Load to SQLite Data Warehouse
        cursor = self.conn.cursor()

        cursor.executemany("INSERT INTO dim_date VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", list(dim_date_records.values()))
        cursor.executemany("INSERT INTO dim_category VALUES (?, ?, ?, ?, ?)", list(dim_category_records.values()))
        cursor.executemany("INSERT INTO dim_merchant VALUES (?, ?, ?, ?)", list(dim_merchant_records.values()))
        cursor.executemany("INSERT INTO dim_payment_method VALUES (?, ?, ?)", list(dim_pm_records.values()))
        cursor.executemany("INSERT INTO fact_transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", fact_rows)

        self.conn.commit()
        print(f"ETL Complete: Loaded {len(fact_rows)} facts across 4 dimension tables.")
        print(f"Total anomalies flagged: {sum(1 for f in fact_rows if f[8] == 1)}")


if __name__ == "__main__":
    pipeline = FinancialETLPipeline(
        raw_csv_path="data/raw_transactions.csv",
        db_output_path="data/financial_data_warehouse.db"
    )
    pipeline.run_pipeline()
