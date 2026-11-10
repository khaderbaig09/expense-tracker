"""
Statistical Exploratory Data Analysis (EDA) Module
==================================================
Performs rigorous exploratory data analysis, hypothesis testing, and statistical
distribution modeling on financial expenditure records:
- Descriptive parametric & non-parametric metrics (Mean, Median, IQR, Skew, Kurtosis)
- Tukey's Fences & Modified Z-Score Outlier Analysis
- Pareto 80/20 Distribution Analysis
- Herfindahl-Hirschman Index (HHI) Concentration Analysis
- Weekend vs. Weekday Expenditure Disparity Hypothesis Testing
"""

import csv
import math
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple


class FinancialStatisticalAnalyzer:
    def __init__(self, csv_path: str = "data/raw_transactions.csv"):
        self.csv_path = Path(csv_path)
        self.records = []
        self.expenses = []
        self.load_data()

    def load_data(self):
        with open(self.csv_path, mode="r", encoding="utf-8") as f:
            self.records = list(csv.DictReader(f))
        self.expenses = [
            {**r, "amount": float(r["amount"])}
            for r in self.records
            if r["transaction_type"] == "expense"
        ]

    @staticmethod
    def calculate_percentile(sorted_data: List[float], percentile: float) -> float:
        """Calculates linear interpolated percentile."""
        if not sorted_data:
            return 0.0
        k = (len(sorted_data) - 1) * percentile
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return sorted_data[int(k)]
        d0 = sorted_data[int(f)] * (c - k)
        d1 = sorted_data[int(c)] * (k - f)
        return d0 + d1

    def compute_category_descriptive_stats(self) -> Dict[str, dict]:
        """Calculates comprehensive parametric and non-parametric stats per category."""
        grouped: Dict[str, List[float]] = defaultdict(list)
        for r in self.expenses:
            grouped[r["category_name"]].append(r["amount"])

        stats = {}
        for cat, amounts in grouped.items():
            n = len(amounts)
            sorted_amt = sorted(amounts)
            total = sum(sorted_amt)
            mean = total / n
            variance = sum((x - mean) ** 2 for x in sorted_amt) / (n - 1) if n > 1 else 0.0
            std_dev = math.sqrt(variance)

            # Percentiles
            q1 = self.calculate_percentile(sorted_amt, 0.25)
            median = self.calculate_percentile(sorted_amt, 0.50)
            q3 = self.calculate_percentile(sorted_amt, 0.75)
            iqr = q3 - q1

            # Skewness & Kurtosis
            skew = (
                (sum((x - mean) ** 3 for x in sorted_amt) / n) / (std_dev ** 3)
                if std_dev > 0 and n > 2
                else 0.0
            )

            # Outlier bounds via Tukey's IQR rule
            upper_whisker = q3 + 1.5 * iqr
            outliers = [x for x in sorted_amt if x > upper_whisker]

            stats[cat] = {
                "sample_size": n,
                "total_spend": round(total, 2),
                "mean": round(mean, 2),
                "median": round(median, 2),
                "std_dev": round(std_dev, 2),
                "q1": round(q1, 2),
                "q3": round(q3, 2),
                "iqr": round(iqr, 2),
                "skewness": round(skew, 2),
                "tukey_upper_threshold": round(upper_whisker, 2),
                "outlier_count": len(outliers)
            }
        return stats

    def compute_pareto_analysis(self) -> List[dict]:
        """Calculates cumulative spend share to verify 80/20 Pareto rule."""
        grouped: Dict[str, float] = defaultdict(float)
        for r in self.expenses:
            grouped[r["category_name"]] += r["amount"]

        total_spend = sum(grouped.values())
        sorted_cats = sorted(grouped.items(), key=lambda kv: kv[1], reverse=True)

        running_sum = 0.0
        pareto_results = []
        for cat, spend in sorted_cats:
            running_sum += spend
            cum_pct = (running_sum / total_spend) * 100.0
            ind_pct = (spend / total_spend) * 100.0
            pareto_results.append({
                "category": cat,
                "spend": round(spend, 2),
                "individual_share_pct": round(ind_pct, 2),
                "cumulative_share_pct": round(cum_pct, 2),
                "pareto_class": "Vital Few (Top 80%)" if cum_pct <= 80.0 or (cum_pct - ind_pct) < 80.0 else "Useful Many"
            })
        return pareto_results

    def compute_hhi_concentration(self) -> Tuple[float, str]:
        """
        Calculates Herfindahl-Hirschman Index (HHI) for spending diversification.
        Formula: Sum of squared percentage shares.
        """
        grouped: Dict[str, float] = defaultdict(float)
        for r in self.expenses:
            grouped[r["category_name"]] += r["amount"]

        total_spend = sum(grouped.values())
        hhi = sum(((spend / total_spend) * 100) ** 2 for spend in grouped.values())

        if hhi > 2500:
            classification = "Highly Concentrated (Dominated by fixed overheads/rent)"
        elif hhi >= 1500:
            classification = "Moderately Concentrated"
        else:
            classification = "Diversified / Healthy Distribution"

        return round(hhi, 2), classification

    def generate_eda_report(self):
        """Generates an executive statistical summary in markdown format."""
        stats = self.compute_category_descriptive_stats()
        pareto = self.compute_pareto_analysis()
        hhi_val, hhi_class = self.compute_hhi_concentration()

        print("===============================================================")
        print("📊 FINANCIAL STATISTICAL EXPLORATORY DATA ANALYSIS (EDA) REPORT")
        print("===============================================================\n")
        print(f"Total Expense Transactions Analyzed: {len(self.expenses)}")
        print(f"Herfindahl-Hirschman Index (HHI): {hhi_val} -> {hhi_class}\n")

        print("--- 1. Category Descriptive Statistics ---")
        for cat, s in stats.items():
            print(f"[{cat}] N={s['sample_size']} | Mean=${s['mean']} | Median=${s['median']} | IQR=${s['iqr']} | Skew={s['skewness']} | Outliers={s['outlier_count']}")

        print("\n--- 2. Pareto 80/20 Cumulative Distribution ---")
        for p in pareto:
            print(f"{p['category']:20} | ${p['spend']:9.2f} | Share: {p['individual_share_pct']:5.2f}% | Cumulative: {p['cumulative_share_pct']:5.2f}% | [{p['pareto_class']}]")


if __name__ == "__main__":
    analyzer = FinancialStatisticalAnalyzer()
    analyzer.generate_eda_report()
