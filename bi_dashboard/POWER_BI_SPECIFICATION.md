# 📊 Power BI Enterprise Data Model & DAX Measure Blueprint

This document specifies the Star Schema data model, relationships, and production DAX measures required to replicate the **FinancePulse Financial Analytics Dashboard** in Power BI Desktop / Power BI Service.

---

## 🏛️ 1. Data Model Relationships

| From Table (Many) | Foreign Key | To Table (One) | Primary Key | Cardinality | Cross Filter Direction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `fact_transactions` | `date_key` | `dim_date` | `date_key` | Many to One (N:1) | Single (`dim_date` filters `fact_transactions`) |
| `fact_transactions` | `category_id` | `dim_category` | `category_id` | Many to One (N:1) | Single |
| `fact_transactions` | `merchant_id` | `dim_merchant` | `merchant_id` | Many to One (N:1) | Single |
| `fact_transactions` | `payment_method_id` | `dim_payment_method` | `payment_method_id` | Many to One (N:1) | Single |

---

## 📐 2. Key DAX Measures Library

### Core Financial Measures
```dax
// Total Expenditure
Total Spend = 
CALCULATE(
    SUM(fact_transactions[amount]),
    fact_transactions[transaction_type] = "expense"
)

// Total Income
Total Income = 
CALCULATE(
    SUM(fact_transactions[amount]),
    fact_transactions[transaction_type] = "income"
)

// Net Savings / Cash Flow
Net Cash Flow = 
[Total Income] - [Total Spend]

// Monthly Savings Rate (%)
Savings Rate % = 
DIVIDE([Net Cash Flow], [Total Income], 0) * 100
```

### Time-Intelligence & Variance Measures
```dax
// Prior Month Spend
Prior Month Spend = 
CALCULATE(
    [Total Spend],
    PREVIOUSMONTH(dim_date[full_date])
)

// Month-over-Month (MoM) Spend Growth %
MoM Spend Growth % = 
VAR CurrentSpend = [Total Spend]
VAR PriorSpend = [Prior Month Spend]
RETURN
    DIVIDE(CurrentSpend - PriorSpend, PriorSpend, 0) * 100

// Rolling 30-Day Spend
Rolling 30D Spend = 
CALCULATE(
    [Total Spend],
    DATESINPERIOD(
        dim_date[full_date],
        MAX(dim_date[full_date]),
        -30,
        DAY
    )
)

// Daily Average Burn Rate
Daily Burn Rate = 
DIVIDE(
    [Total Spend],
    DISTINCTCOUNT(dim_date[date_key]),
    0
)
```

### Pareto 80/20 Cumulative Distribution
```dax
// Cumulative Spend Share for Pareto Chart
Pareto Cumulative % = 
VAR TotalCategorySpend = [Total Spend]
VAR CurrentCatSpend = [Total Spend]
VAR RunningTotal = 
    CALCULATE(
        [Total Spend],
        FILTER(
            ALLSELECTED(dim_category[category_name]),
            [Total Spend] >= CurrentCatSpend
        )
    )
RETURN
    DIVIDE(RunningTotal, CALCULATE([Total Spend], ALLSELECTED(dim_category)), 0) * 100
```

### Spending Concentration (HHI Index)
```dax
// Herfindahl-Hirschman Index in DAX
HHI Concentration Index = 
VAR TotalMarket = CALCULATE([Total Spend], ALL(dim_category))
RETURN
    SUMX(
        VALUES(dim_category[category_name]),
        VAR CatShare = DIVIDE([Total Spend], TotalMarket, 0) * 100
        RETURN CatShare * CatShare
    )
```

---

## 🎨 3. Recommended Canvas Layout (16:9 1920x1080)

1. **Header Ribbon:** Date Slicer, Category Type Slicer, Currency Formatter, Anomaly Threshold Slider.
2. **Top KPI Scorecard Band:**
   - Card 1: `[Total Income]` with YoY Sparkline
   - Card 2: `[Total Spend]` with MoM Delta Indicator
   - Card 3: `[Savings Rate %]` with Target Goal Gauge (Target: $\ge 25\%$)
   - Card 4: `[Daily Burn Rate]` & Estimated Runway Months
   - Card 5: `[HHI Concentration Index]` with Risk Category Badge
3. **Primary Analytics Matrix:**
   - Visual 1 (Left 60%): Waterfall chart showing MoM net cash flow variance drivers by category.
   - Visual 2 (Right 40%): Pareto Dual-Axis visual (Category Spend Bars + Cumulative % Line).
4. **Bottom Diagnostic Grid:**
   - Visual 3: Scatter plot of transaction amounts vs. date with dynamic Z-Score color conditional formatting.
   - Visual 4: Decomposition Tree analyzing spend drivers by Channel -> Merchant -> Subscriptions.
