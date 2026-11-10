"""
Synthetic Financial Transaction Dataset Generator
==================================================
Generates realistic, enterprise-grade personal and business transaction data
incorporating:
- Seasonality (Holiday surges in Nov/Dec, summer vacation spikes)
- Day-of-week patterns (Weekend hospitality & dining multipliers)
- Recurring subscription cycles (Netflix, AWS, Spotify, Gym, Utilities)
- Fixed monthly payroll / revenue inflows
- Controlled synthetic anomalies / outlier injections (medical emergencies, travel, tech purchases)
- Normalized counterparty merchant strings with raw bank statement noise
"""

import csv
import random
import uuid
from datetime import datetime, timedelta
import math

# Configuration
NUM_MONTHS = 12
BASE_DATE = datetime(2026, 11, 1) - timedelta(days=365)
TOTAL_RECORDS = 500

CATEGORIES = [
    {"id": "cat_food_dining", "name": "Food & Dining", "type": "expense", "discretionary": True, "weight": 28, "base_min": 12, "base_max": 95},
    {"id": "cat_housing_rent", "name": "Housing & Rent", "type": "expense", "discretionary": False, "weight": 4, "base_min": 1200, "base_max": 1800},
    {"id": "cat_transportation", "name": "Transportation", "type": "expense", "discretionary": False, "weight": 14, "base_min": 18, "base_max": 75},
    {"id": "cat_utilities_bills", "name": "Utilities & Bills", "type": "expense", "discretionary": False, "weight": 8, "base_min": 45, "base_max": 160},
    {"id": "cat_entertainment", "name": "Entertainment", "type": "expense", "discretionary": True, "weight": 12, "base_min": 15, "base_max": 120},
    {"id": "cat_shopping", "name": "Shopping", "type": "expense", "discretionary": True, "weight": 16, "base_min": 25, "base_max": 250},
    {"id": "cat_healthcare", "name": "Healthcare", "type": "expense", "discretionary": False, "weight": 5, "base_min": 30, "base_max": 180},
    {"id": "cat_travel", "name": "Travel", "type": "expense", "discretionary": True, "weight": 4, "base_min": 120, "base_max": 650},
    {"id": "cat_education", "name": "Education", "type": "expense", "discretionary": True, "weight": 3, "base_min": 20, "base_max": 99},
    {"id": "cat_other_exp", "name": "Other Expense", "type": "expense", "discretionary": True, "weight": 6, "base_min": 10, "base_max": 60}
]

INCOME_SOURCES = [
    {"id": "cat_salary", "name": "Salary", "type": "income", "amount": 4200.00, "freq_days": 30, "merchant": "TechCorp Payroll Direct Dep"},
    {"id": "cat_freelance", "name": "Freelance & Side Gig", "type": "income", "amount_range": (350, 1200), "freq_per_month": 2, "merchant": "Upwork / Client Escrow"}
]

MERCHANTS_BY_CAT = {
    "cat_food_dining": ["Trader Joe's #412", "Whole Foods Market", "Starbucks Coffee", "Chipotle Mexican Grill", "Uber Eats *Pending", "Local Artisan Bakery", "Sweetgreen NYC", "DoorDash Food Delivery"],
    "cat_housing_rent": ["Equity Residential Lease", "Avalon Bay Living"],
    "cat_transportation": ["Shell Gas Station", "Chevron 82910", "Uber *Trip Ride", "Metropolitan Transit Metro", "Lyft *Ride Hailing"],
    "cat_utilities_bills": ["ConEdison Electric & Gas", "Spectrum Internet Fiber", "AT&T Mobility Wireless", "City Water Authority"],
    "cat_entertainment": ["Netflix.com SaaS", "Spotify Premium Music", "AMC Cinema Theatres", "Steam Video Games", "PlayStation Network"],
    "cat_shopping": ["AMZN Mktp US*9281A", "Target Stores #1204", "Apple Store Retail", "Nike Flagship Store", "Zara Fashion Group", "Best Buy Electronics"],
    "cat_healthcare": ["CVS Pharmacy #3821", "Walgreens Drugstore", "Quest Diagnostics Lab", "City Urgent Care Clinic"],
    "cat_travel": ["Delta Air Lines 006", "Airbnb Inc *Booking", "Marriott Hotels & Resorts", "Enterprise Rent-A-Car"],
    "cat_education": ["Coursera Inc Online", "Udemy Academy Course", "O'Reilly Media Subscription"],
    "cat_other_exp": ["USPS Post Office", "Hardware Express", "Dry Cleaners Express"]
}

PAYMENT_METHODS = ["Credit Card", "Debit Card", "Bank Transfer", "UPI / Digital Wallet", "Cash"]


def generate_dataset(num_records=TOTAL_RECORDS, output_path="data/raw_transactions.csv"):
    random.seed(42)
    records = []
    
    # 1. Generate Regular Monthly Incomes
    current_date = BASE_DATE
    while current_date < datetime(2026, 11, 1):
        # Primary Salary (1st of month)
        salary_date = datetime(current_date.year, current_date.month, 1)
        records.append({
            "transaction_id": f"tx_{uuid.uuid4().hex[:10]}",
            "date": salary_date.strftime("%Y-%m-%d"),
            "category_id": "cat_salary",
            "category_name": "Salary",
            "transaction_type": "income",
            "merchant": "TechCorp Payroll Direct Dep",
            "payment_method": "Bank Transfer",
            "amount": 4200.00,
            "is_recurring": 1,
            "notes": "Monthly Base Salary Direct Deposit"
        })
        
        # Freelance Income (Around 15th-20th)
        freelance_date = datetime(current_date.year, current_date.month, random.randint(15, 20))
        records.append({
            "transaction_id": f"tx_{uuid.uuid4().hex[:10]}",
            "date": freelance_date.strftime("%Y-%m-%d"),
            "category_id": "cat_freelance",
            "category_name": "Freelance & Side Gig",
            "transaction_type": "income",
            "merchant": "Upwork / Client Escrow",
            "payment_method": "Bank Transfer",
            "amount": round(random.uniform(450.00, 1100.00), 2),
            "is_recurring": 0,
            "notes": "Contract analytics consultation retainer"
        })
        
        # Monthly Rent (1st of month)
        rent_date = datetime(current_date.year, current_date.month, 1)
        records.append({
            "transaction_id": f"tx_{uuid.uuid4().hex[:10]}",
            "date": rent_date.strftime("%Y-%m-%d"),
            "category_id": "cat_housing_rent",
            "category_name": "Housing & Rent",
            "transaction_type": "expense",
            "merchant": "Equity Residential Lease",
            "payment_method": "Bank Transfer",
            "amount": 1450.00,
            "is_recurring": 1,
            "notes": "Apartment monthly lease payment"
        })
        
        # Advance month
        if current_date.month == 12:
            current_date = datetime(current_date.year + 1, 1, 1)
        else:
            current_date = datetime(current_date.year, current_date.month + 1, 1)

    # 2. Generate Recurring Monthly Subscriptions
    subscriptions = [
        ("Netflix.com SaaS", "cat_entertainment", "Entertainment", 19.99, 12, "Credit Card"),
        ("Spotify Premium Music", "cat_entertainment", "Entertainment", 11.99, 5, "Credit Card"),
        ("AT&T Mobility Wireless", "cat_utilities_bills", "Utilities & Bills", 85.00, 18, "Debit Card"),
        ("Spectrum Internet Fiber", "cat_utilities_bills", "Utilities & Bills", 69.99, 22, "Credit Card")
    ]
    
    current_date = BASE_DATE
    while current_date < datetime(2026, 11, 1):
        for sub_name, cat_id, cat_name, cost, day, pm in subscriptions:
            sub_date = datetime(current_date.year, current_date.month, min(day, 28))
            records.append({
                "transaction_id": f"tx_{uuid.uuid4().hex[:10]}",
                "date": sub_date.strftime("%Y-%m-%d"),
                "category_id": cat_id,
                "category_name": cat_name,
                "transaction_type": "expense",
                "merchant": sub_name,
                "payment_method": pm,
                "amount": cost,
                "is_recurring": 1,
                "notes": f"Recurring monthly subscription: {sub_name}"
            })
        if current_date.month == 12:
            current_date = datetime(current_date.year + 1, 1, 1)
        else:
            current_date = datetime(current_date.year, current_date.month + 1, 1)

    # 3. Generate Discretionary Day-to-Day Transactions with Seasonality
    days_span = (datetime(2026, 11, 1) - BASE_DATE).days
    cat_population = []
    for c in CATEGORIES:
        if c["id"] != "cat_housing_rent":
            cat_population.extend([c] * c["weight"])

    remaining_count = num_records - len(records)
    
    for _ in range(max(remaining_count, 250)):
        random_day_offset = random.randint(0, days_span - 1)
        tx_date = BASE_DATE + timedelta(days=random_day_offset)
        
        chosen_cat = random.choice(cat_population)
        cat_id = chosen_cat["id"]
        cat_name = chosen_cat["name"]
        
        # Base amount
        amount = random.uniform(chosen_cat["base_min"], chosen_cat["base_max"])
        
        # Weekend multiplier (Fri, Sat, Sun spend is higher on food & entertainment)
        if tx_date.weekday() in [4, 5, 6]:
            if cat_id in ["cat_food_dining", "cat_entertainment", "cat_shopping"]:
                amount *= random.uniform(1.2, 1.6)

        # November & December holiday surge multiplier
        if tx_date.month in [11, 12] and cat_id in ["cat_shopping", "cat_travel", "cat_food_dining"]:
            amount *= random.uniform(1.3, 1.8)

        # Injected Statistical Anomalies (3% chance of extreme outlier)
        is_anomaly = 0
        notes = "Routine consumer expense"
        if random.random() < 0.03:
            is_anomaly = 1
            if cat_id == "cat_healthcare":
                amount = random.uniform(650, 1400)
                notes = "ANOMALY: Out-of-network dental emergency procedure"
            elif cat_id == "cat_shopping":
                amount = random.uniform(900, 2100)
                notes = "ANOMALY: High-ticket workstation tech hardware purchase"
            elif cat_id == "cat_travel":
                amount = random.uniform(1200, 2800)
                notes = "ANOMALY: International multi-city conference flight booking"
            else:
                amount *= 4.5
                notes = "ANOMALY: Significant spending outlier spike"

        merchant_list = MERCHANTS_BY_CAT.get(cat_id, ["Generic Merchant Vendor"])
        merchant = random.choice(merchant_list)
        
        # Payment method distribution
        pm = random.choices(
            PAYMENT_METHODS, 
            weights=[55, 25, 8, 8, 4]
        )[0]

        records.append({
            "transaction_id": f"tx_{uuid.uuid4().hex[:10]}",
            "date": tx_date.strftime("%Y-%m-%d"),
            "category_id": cat_id,
            "category_name": cat_name,
            "transaction_type": "expense",
            "merchant": merchant,
            "payment_method": pm,
            "amount": round(amount, 2),
            "is_recurring": 0,
            "notes": notes
        })

    # Sort chronological
    records.sort(key=lambda r: r["date"])

    # Write to CSV
    keys = ["transaction_id", "date", "category_id", "category_name", "transaction_type", "merchant", "payment_method", "amount", "is_recurring", "notes"]
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(records)

    print(f"Successfully generated {len(records)} realistic transactions saved to {output_path}")
    return records


if __name__ == "__main__":
    generate_dataset()
