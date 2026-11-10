# 📖 Enterprise Financial Analytics — Data Dictionary & Metric Specs

This document defines the schema, data types, business definitions, and statistical formulas used across the **FinancePulse Financial Analytics & Intelligence Platform**.

---

## 🏛️ Dimensional Model (Star Schema)

The analytics platform employs a **Kimball-style Dimensional Star Schema** optimized for high-performance Online Analytical Processing (OLAP) queries, slice-and-dice aggregations, and business intelligence reporting.

```
                      ┌──────────────────────┐
                      │      dim_date        │
                      ├──────────────────────┤
                      │ PK  date_key         │
                      │     full_date        │
                      │     day_of_week_num  │
                      │     day_name         │
                      │     is_weekend       │
                      │     week_of_year     │
                      │     month_num        │
                      │     month_name       │
                      │     quarter          │
                      │     year             │
                      └──────────┬───────────┘
                                 │
                                 │ 1:N
                                 ▼
┌──────────────────────┐   ┌──────────────────────────────┐   ┌───────────────────────────┐
│     dim_category     │   │      fact_transactions       │   │       dim_merchant        │
├──────────────────────┤   ├──────────────────────────────┤   ├───────────────────────────┤
│ PK  category_id      ├──►│ PK   transaction_id          │◄──┤ PK  merchant_id           │
│     category_name    │   │ FK   date_key                │   │     merchant_name         │
│     category_type    │   │ FK   category_id             │   │     clean_merchant_name   │
│     budget_cap       │   │ FK   merchant_id             │   │     merchant_category_code│
│     is_discretionary │   │ FK   payment_method_id       │   │     is_subscription       │
│     icon             │   │      amount                  │   └───────────────────────────┘
│     color_hex        │   │      is_recurring            │
└──────────────────────┘   │      is_anomaly              │
                           │      anomaly_score           │
                           │      notes                   │
                           └──────────────┬───────────────┘
                                          │
                                          │ N:1
                                          ▼
                             ┌────────────────────────┐
                             │   dim_payment_method   │
                             ├────────────────────────┤
                             │ PK  payment_method_id  │
                             │     payment_method_name│
                             │     channel_type       │
                             │     processing_fee_pct │
                             └────────────────────────┘
```

---

## 📊 Table Specifications

### 1. `fact_transactions` (Grain: One row per financial transaction)

| Column Name | SQL Type | Constraint | Business Definition | Example |
| :--- | :--- | :--- | :--- | :--- |
| `transaction_id` | `VARCHAR(36)` | PRIMARY KEY | Unique UUID for the transaction | `tx_8f91c7a2-4e` |
| `date_key` | `INTEGER` | FOREIGN KEY | Date surrogate key formatted as YYYYMMDD | `20261015` |
| `category_id` | `VARCHAR(32)` | FOREIGN KEY | ID of category classification | `cat_food_dining` |
| `merchant_id` | `VARCHAR(32)` | FOREIGN KEY | ID of counterparty merchant / vendor | `merch_wholefoods` |
| `payment_method_id`| `VARCHAR(32)` | FOREIGN KEY | ID of payment channel used | `pm_credit_card` |
| `transaction_type`| `VARCHAR(10)` | NOT NULL | Transaction classification (`income` or `expense`) | `expense` |
| `amount` | `DECIMAL(12,2)` | NOT NULL | Monetary transaction magnitude in base currency | `84.50` |
| `is_recurring` | `BOOLEAN` | DEFAULT 0 | 1 if part of detected recurring subscription cadence | `0` |
| `is_anomaly` | `BOOLEAN` | DEFAULT 0 | 1 if flagged as statistical spending anomaly | `0` |
| `anomaly_score` | `DECIMAL(5,2)` | NULLABLE | Modified Z-score or IQR distance factor | `3.45` |
| `created_at` | `TIMESTAMP` | NOT NULL | Record creation timestamp | `2026-10-15 14:22:00` |

---

### 2. `dim_date` (Grain: One row per calendar date)

| Column Name | SQL Type | Description | Values / Format |
| :--- | :--- | :--- | :--- |
| `date_key` | `INTEGER` | Surrogate Key | `YYYYMMDD` (e.g. `20260101`) |
| `full_date` | `DATE` | Standard ISO date | `2026-01-01` |
| `day_of_week_num` | `SMALLINT` | ISO day of week index (1=Mon, 7=Sun) | `1` to `7` |
| `day_name` | `VARCHAR(10)` | Day of week string | `Monday`, `Tuesday`, ... |
| `is_weekend` | `BOOLEAN` | Indicator for weekend days (Sat, Sun) | `0` or `1` |
| `week_of_year` | `SMALLINT` | ISO 8601 calendar week number | `1` to `53` |
| `month_num` | `SMALLINT` | Month number | `1` to `12` |
| `month_name` | `VARCHAR(10)` | Calendar month name | `January`, ... |
| `quarter` | `VARCHAR(2)` | Fiscal / Calendar quarter | `Q1`, `Q2`, `Q3`, `Q4` |
| `year` | `SMALLINT` | Calendar year | `2025`, `2026` |

---

### 3. `dim_category` (Grain: One row per spending / revenue category)

| Column Name | SQL Type | Description |
| :--- | :--- | :--- |
| `category_id` | `VARCHAR(32)` | Unique category surrogate key |
| `category_name` | `VARCHAR(64)` | Display name (e.g., `Housing & Rent`, `Food & Dining`) |
| `category_type` | `VARCHAR(10)` | Category group: `expense` or `income` |
| `budget_cap` | `DECIMAL(12,2)` | Target monthly budget allocation ceiling |
| `is_discretionary` | `BOOLEAN` | 1 if flexible / non-essential; 0 if essential fixed cost |
| `icon` | `VARCHAR(32)` | Lucide icon identifier |
| `color_hex` | `VARCHAR(7)` | Palette hex code for BI visualizations |

---

### 4. `dim_merchant` (Grain: One row per unique vendor / payee)

| Column Name | SQL Type | Description |
| :--- | :--- | :--- |
| `merchant_id` | `VARCHAR(32)` | Unique merchant identifier |
| `merchant_name` | `VARCHAR(128)` | Raw vendor string from bank statement |
| `clean_merchant_name` | `VARCHAR(128)` | Normalized entity name (e.g. `AMZN MKTP US*` -> `Amazon`) |
| `is_subscription` | `BOOLEAN` | Flag indicating subscription SaaS / membership vendor |

---

## 📐 Key Financial & Statistical Metric Formulas

### 1. Net Operating Cash Flow
$$\text{Net Cash Flow} = \sum \text{Income} - \sum \text{Expenses}$$

### 2. Monthly Savings Rate (%)
$$\text{Savings Rate} = \left( \frac{\sum \text{Income} - \sum \text{Expenses}}{\sum \text{Income}} \right) \times 100\%$$

### 3. Daily Burn Rate
$$\text{Daily Burn Rate} = \frac{\sum_{t=1}^{N} \text{Expenses}_t}{N_{\text{days in period}}}$$

### 4. Cash Runway (Months)
$$\text{Cash Runway} = \frac{\text{Current Liquid Cash Reserve}}{\text{Monthly Burn Rate}}$$

### 5. Spending Concentration Index (Herfindahl-Hirschman Index - HHI)
Quantifies whether spending is dangerously concentrated in 1-2 categories or well-diversified.
$$\text{HHI} = \sum_{i=1}^{K} \left( s_i \times 100 \right)^2$$
Where $s_i = \frac{\text{Spend in Category}_i}{\text{Total Spend}}$.
- $\text{HHI} < 1,500$: Highly Diversified spending
- $1,500 \le \text{HHI} \le 2,500$: Moderately Concentrated spending
- $\text{HHI} > 2,500$: Highly Concentrated spending (e.g. rent dominating cashflow)

### 6. Pareto Analysis (80/20 Cumulative Contribution)
Identifies the vital few categories/merchants driving $\ge 80\%$ of total outflow:
$$\text{Cumulative Spend Share}_k = \frac{\sum_{i=1}^{k} \text{Spend}_{(i)}}{\sum_{i=1}^{N} \text{Spend}_i} \times 100\%$$
*(Categories sorted descending by spend amount)*

### 7. Statistical Anomaly Detection (Tukey's IQR & Modified Z-Score)

#### A. Tukey's Interquartile Range (IQR) Rule:
$$\text{IQR} = Q_3 - Q_1$$
$$\text{Mild Outlier Threshold} = Q_3 + 1.5 \times \text{IQR}$$
$$\text{Extreme Anomaly Threshold} = Q_3 + 3.0 \times \text{IQR}$$

#### B. Modified Z-Score (Robust against skewed financial data):
$$\text{Modified } Z_i = \frac{0.6745 \times (x_i - \tilde{x})}{\text{MAD}}$$
Where $\tilde{x} = \text{Median}(X)$ and $\text{MAD} = \text{Median}(|x_i - \tilde{x}|)$.
Transactions with $|Z_i| > 3.5$ are flagged as statistical anomalies.

### 8. Time-Series Forecasting (Holt-Winters Triple Exponential Smoothing)
Captures baseline level ($l_t$), linear trend ($b_t$), and weekly seasonality ($s_t$ with period $L=7$):
$$\hat{y}_{t+m} = (l_t + m \cdot b_t) \cdot s_{t-L + (m \bmod L)}$$
With 95% Confidence Prediction Intervals:
$$\text{PI}_{95\%} = \hat{y}_{t+m} \pm 1.96 \cdot \hat{\sigma}_e \sqrt{1 + \frac{m}{N}}$$

### 9. Monte Carlo Simulation Engine
Runs $M = 1,000$ stochastic iterations across remaining calendar days:
$$\text{Simulated Expense}_d \sim \text{LogNormal}\left( \mu_{\ln}, \sigma_{\ln}^2 \right)$$
Calculates Value-at-Risk (VaR) and Budget Overrun Probability:
$$P(\text{Overrun}) = \frac{\sum_{k=1}^{M} \mathbb{I}\left( \text{Total Simulated Spend}_k > \text{Budget} \right)}{M} \times 100\%$$
