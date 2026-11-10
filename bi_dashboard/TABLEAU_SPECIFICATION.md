# 📊 Tableau Dashboard Blueprint & LOD Calculated Fields

This specification documents the data source connections, Level of Detail (LOD) calculated fields, and dashboard architecture for replicating the **FinancePulse Financial Analytics Dashboard** in Tableau Desktop / Tableau Public.

---

## 🗄️ 1. Tableau Data Model (Relationships / Physical Join)

- **Root Table:** `fact_transactions`
- **Related Dimensions:**
  - `dim_date` on `[date_key] = [date_key (dim_date)]`
  - `dim_category` on `[category_id] = [category_id (dim_category)]`
  - `dim_merchant` on `[merchant_id] = [merchant_id (dim_merchant)]`
  - `dim_payment_method` on `[payment_method_id] = [payment_method_id (dim_payment_method)]`

---

## 📐 2. Calculated Fields & LOD Expressions

### Core Measures
```tableau
// Total Expenses
[Total Spend] = 
SUM(IF [Transaction Type] = 'expense' THEN [Amount] ELSE 0 END)

// Total Inflow
[Total Income] = 
SUM(IF [Transaction Type] = 'income' THEN [Amount] ELSE 0 END)

// Net Savings
[Net Savings] = 
[Total Income] - [Total Spend]

// Savings Rate %
[Savings Rate %] = 
ZN([Net Savings]) / ZN([Total Income]) * 100
```

### Advanced Level of Detail (LOD) Calculations
```tableau
// Category Grand Total Spend (Fixed LOD)
[Category Fixed Spend] = 
{ FIXED [Category Name] : SUM(IF [Transaction Type] = 'expense' THEN [Amount] END) }

// Category Median Spend (Fixed LOD)
[Category Median Spend] = 
{ FIXED [Category Name] : MEDIAN(IF [Transaction Type] = 'expense' THEN [Amount] END) }

// Category Standard Deviation (Fixed LOD)
[Category Std Dev] = 
{ FIXED [Category Name] : STDEV(IF [Transaction Type] = 'expense' THEN [Amount] END) }

// Statistical Anomaly Flag (Threshold Parameter: [Z-Score Multiplier])
[Is Outlier Transaction] = 
IF ([Amount] - [Category Median Spend]) > ([Z-Score Multiplier] * [Category Std Dev]) THEN
    'Statistical Anomaly'
ELSE
    'Standard Transaction'
END
```

### Pareto 80/20 Table Calculations
- **Base Measure:** `[Total Spend]`
- **Running Total Calculation:** `RUNNING_SUM([Total Spend])`
- **Secondary Calculation (Percent of Total):** `RUNNING_SUM([Total Spend]) / TOTAL([Total Spend]) * 100`
- **Sort Order:** Specific Dimension -> `[Category Name]` descending by `[Total Spend]`.

---

## 🖥️ 3. Tableau Dashboard Layout & Interactive Actions

1. **Top Container: Executive KPIs (4 Floating Tile Cards)**
   - Tile 1: Total Spend with MoM % Difference indicator.
   - Tile 2: Total Income with Month-to-Date sparkline.
   - Tile 3: Net Cash Savings Rate with color-coded bullet graph.
   - Tile 4: Daily Burn Rate with 30-day moving average.
2. **Main Section (Dual Tabs / Story View):**
   - **Tab 1: Descriptive & Pareto Diagnostic:**
     - Dual Axis Pareto Chart: Bars for `[Total Spend]` sorted descending, line for `[Pareto Cumulative %]`, reference line at 80%.
     - Day of Week Heatmap: Rows = `[Day Name]`, Columns = `[Category Name]`, Color = `SUM([Amount])`.
   - **Tab 2: Predictive & Risk Monitoring:**
     - Time Series Line Chart with Tableau Built-in Exponential Smoothing Forecast (95% Prediction Interval shading).
     - Scatter Plot of Outlier Anomalies colored by `[Is Outlier Transaction]`.
3. **Filter Actions:**
   - Clicking any Category Bar on the Pareto chart cross-filters the transaction detail table and updates the anomaly distribution.
