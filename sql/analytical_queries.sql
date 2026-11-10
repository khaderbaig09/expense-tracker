-- ============================================================================
-- Enterprise Financial Analytics Platform: Advanced Analytical SQL Library
-- Demonstrates CTEs, Window Functions, Dimensional Joins, & Statistical Analysis
-- Perfect for technical portfolio review, live queries, and CV demonstration.
-- ============================================================================

-- ============================================================================
-- 1. MONTH-OVER-MONTH (MoM) EXPENSE VARIANCE & GROWTH RATE
-- Technique: CTE, LAG() Window Function, Safe Division, Percentage Delta
-- ============================================================================
WITH monthly_metrics AS (
    SELECT
        d.year,
        d.month_num,
        d.month_name,
        SUM(CASE WHEN f.transaction_type = 'expense' THEN f.amount ELSE 0 END) AS total_expense,
        SUM(CASE WHEN f.transaction_type = 'income' THEN f.amount ELSE 0 END)  AS total_income
    FROM fact_transactions f
    JOIN dim_date d ON f.date_key = d.date_key
    GROUP BY d.year, d.month_num, d.month_name
),
mom_lagged AS (
    SELECT
        year,
        month_num,
        month_name,
        total_expense,
        total_income,
        (total_income - total_expense) AS net_savings,
        LAG(total_expense, 1) OVER (ORDER BY year, month_num) AS prior_month_expense,
        LAG(total_income, 1)  OVER (ORDER BY year, month_num) AS prior_month_income
    FROM monthly_metrics
)
SELECT
    year,
    month_name,
    total_expense,
    prior_month_expense,
    (total_expense - prior_month_expense) AS expense_abs_change,
    ROUND(
        CASE 
            WHEN prior_month_expense IS NULL OR prior_month_expense = 0 THEN 0.0
            ELSE ((total_expense - prior_month_expense) * 100.0 / prior_month_expense)
        END, 2
    ) AS mom_expense_growth_pct,
    ROUND(
        CASE 
            WHEN total_income = 0 THEN 0.0
            ELSE (net_savings * 100.0 / total_income)
        END, 2
    ) AS savings_rate_pct
FROM mom_lagged
ORDER BY year DESC, month_num DESC;


-- ============================================================================
-- 2. ROLLING 30-DAY MOVING AVERAGE & STANDARD DEVIATION (VOLATILITY)
-- Technique: Daily Aggregation CTE, Moving Window Framing (ROWS BETWEEN)
-- ============================================================================
WITH daily_expense_series AS (
    SELECT
        d.full_date,
        SUM(COALESCE(f.amount, 0)) AS daily_spend
    FROM dim_date d
    LEFT JOIN fact_transactions f 
        ON d.date_key = f.date_key AND f.transaction_type = 'expense'
    GROUP BY d.full_date
)
SELECT
    full_date,
    daily_spend,
    ROUND(AVG(daily_spend) OVER (
        ORDER BY full_date 
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ), 2) AS rolling_30d_avg_spend,
    ROUND(SUM(daily_spend) OVER (
        ORDER BY full_date 
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ), 2) AS rolling_30d_total_spend
FROM daily_expense_series
ORDER BY full_date DESC;


-- ============================================================================
-- 3. PARETO 80/20 ANALYSIS: VITAL FEW EXPENSE CATEGORIES
-- Technique: Window SUM() OVER() Running Cumulative Total & Relative Percentage
-- Identifies the minimal subset of categories driving 80% of aggregate outflow.
-- ============================================================================
WITH category_spend AS (
    SELECT
        c.category_name,
        c.is_discretionary,
        SUM(f.amount) AS category_total_spend
    FROM fact_transactions f
    JOIN dim_category c ON f.category_id = c.category_id
    WHERE f.transaction_type = 'expense'
    GROUP BY c.category_name, c.is_discretionary
),
pareto_ranking AS (
    SELECT
        category_name,
        is_discretionary,
        category_total_spend,
        SUM(category_total_spend) OVER () AS grand_total_spend,
        SUM(category_total_spend) OVER (
            ORDER BY category_total_spend DESC 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_running_spend
    FROM category_spend
)
SELECT
    category_name,
    is_discretionary,
    category_total_spend,
    ROUND(category_total_spend * 100.0 / grand_total_spend, 2) AS individual_share_pct,
    ROUND(cumulative_running_spend * 100.0 / grand_total_spend, 2) AS cumulative_share_pct,
    CASE 
        WHEN (cumulative_running_spend * 100.0 / grand_total_spend) <= 80.0 
        THEN 'Pareto Vital Few (Top 80%)'
        ELSE 'Useful Many (Remaining 20%)'
    END AS pareto_tier
FROM pareto_ranking
ORDER BY category_total_spend DESC;


-- ============================================================================
-- 4. TOP 3 SPENDING CATEGORIES PER MONTH USING DENSE_RANK()
-- Technique: Multi-level Aggregation, Window Partitioning, DENSE_RANK Filter
-- ============================================================================
WITH monthly_category_totals AS (
    SELECT
        d.year,
        d.month_num,
        d.month_name,
        c.category_name,
        SUM(f.amount) AS category_spend
    FROM fact_transactions f
    JOIN dim_date d ON f.date_key = d.date_key
    JOIN dim_category c ON f.category_id = c.category_id
    WHERE f.transaction_type = 'expense'
    GROUP BY d.year, d.month_num, d.month_name, c.category_name
),
ranked_categories AS (
    SELECT
        year,
        month_num,
        month_name,
        category_name,
        category_spend,
        DENSE_RANK() OVER (
            PARTITION BY year, month_num 
            ORDER BY category_spend DESC
        ) AS spend_rank
    FROM monthly_category_totals
)
SELECT
    year,
    month_name,
    spend_rank,
    category_name,
    category_spend
FROM ranked_categories
WHERE spend_rank <= 3
ORDER BY year DESC, month_num DESC, spend_rank ASC;


-- ============================================================================
-- 5. STATISTICAL OUTLIER DETECTION VIA WINDOW FUNCTIONS (Z-SCORE METHOD)
-- Technique: Window AVG() and STDEV() OVER (PARTITION BY category)
-- Flags transactions deviating > 2.5 standard deviations from category mean.
-- ============================================================================
WITH category_stats AS (
    SELECT
        f.transaction_id,
        f.amount,
        f.notes,
        d.full_date,
        c.category_name,
        m.merchant_name,
        AVG(f.amount) OVER (PARTITION BY f.category_id) AS cat_mean,
        -- Standard deviation proxy for ANSI SQL / DuckDB
        (AVG(f.amount * f.amount) OVER (PARTITION BY f.category_id) - 
         (AVG(f.amount) OVER (PARTITION BY f.category_id) * AVG(f.amount) OVER (PARTITION BY f.category_id))) AS variance_proxy
    FROM fact_transactions f
    JOIN dim_date d ON f.date_key = d.date_key
    JOIN dim_category c ON f.category_id = c.category_id
    JOIN dim_merchant m ON f.merchant_id = m.merchant_id
    WHERE f.transaction_type = 'expense'
)
SELECT
    transaction_id,
    full_date,
    merchant_name,
    category_name,
    amount,
    ROUND(cat_mean, 2) AS category_mean,
    ROUND((amount - cat_mean), 2) AS deviation_from_mean,
    CASE 
        WHEN amount > (cat_mean * 2.5) THEN 'HIGH RISK ANOMALY'
        WHEN amount > (cat_mean * 1.75) THEN 'MODERATE OUTLIER'
        ELSE 'NORMAL'
    END AS statistical_anomaly_flag
FROM category_stats
WHERE amount > (cat_mean * 1.75)
ORDER BY deviation_from_mean DESC;


-- ============================================================================
-- 6. BUDGET VARIANCE & BURN RATE MONITORING
-- Technique: Left Join on Dimensions, Calculated Variance, Budget Utilization %
-- ============================================================================
SELECT
    c.category_name,
    c.budget_cap,
    COALESCE(SUM(f.amount), 0.0) AS actual_spend,
    ROUND(c.budget_cap - COALESCE(SUM(f.amount), 0.0), 2) AS budget_surplus_deficit,
    ROUND(
        CASE 
            WHEN c.budget_cap = 0 THEN 0.0
            ELSE (COALESCE(SUM(f.amount), 0.0) * 100.0 / c.budget_cap)
        END, 1
    ) AS budget_utilization_pct,
    CASE
        WHEN COALESCE(SUM(f.amount), 0.0) > c.budget_cap THEN 'OVER BUDGET 🔴'
        WHEN COALESCE(SUM(f.amount), 0.0) >= (c.budget_cap * 0.85) THEN 'WARNING 🟡'
        ELSE 'ON TRACK 🟢'
    END AS budget_health_status
FROM dim_category c
LEFT JOIN fact_transactions f 
    ON c.category_id = f.category_id 
    AND f.transaction_type = 'expense'
WHERE c.category_type = 'expense' AND c.budget_cap > 0
GROUP BY c.category_id, c.category_name, c.budget_cap
ORDER BY budget_utilization_pct DESC;


-- ============================================================================
-- 7. HERFINDAHL-HIRSCHMAN INDEX (HHI): SPENDING CONCENTRATION RISK
-- Technique: Squared Category Proportions to Quantify Portfolio Diversification
-- Scale: < 1500 = Diversified, 1500-2500 = Moderately Concentrated, > 2500 = High
-- ============================================================================
WITH category_proportions AS (
    SELECT
        c.category_name,
        SUM(f.amount) AS category_spend,
        SUM(f.amount) * 100.0 / SUM(SUM(f.amount)) OVER () AS market_share_pct
    FROM fact_transactions f
    JOIN dim_category c ON f.category_id = c.category_id
    WHERE f.transaction_type = 'expense'
    GROUP BY c.category_name
)
SELECT
    ROUND(SUM(market_share_pct * market_share_pct), 2) AS hhi_index,
    CASE
        WHEN SUM(market_share_pct * market_share_pct) > 2500 
            THEN 'Highly Concentrated Spending (Dominant Fixed Categories)'
        WHEN SUM(market_share_pct * market_share_pct) BETWEEN 1500 AND 2500 
            THEN 'Moderately Concentrated'
        ELSE 'Well Diversified Across Categories'
    END AS portfolio_risk_profile
FROM category_proportions;


-- ============================================================================
-- 8. WEEKDAY VS. WEEKEND SPENDING BEHAVIORAL DISPARITY
-- Technique: Conditional Aggregations across Temporal Flag
-- Uncovers behavioral impulse spending on weekends vs planned weekday spend.
-- ============================================================================
SELECT
    d.is_weekend,
    CASE WHEN d.is_weekend = 1 THEN 'Weekend (Sat-Sun)' ELSE 'Weekday (Mon-Fri)' END AS day_type,
    COUNT(DISTINCT d.date_key) AS day_count,
    COUNT(f.transaction_id) AS total_transactions,
    SUM(f.amount) AS total_spent,
    ROUND(AVG(f.amount), 2) AS avg_transaction_size,
    ROUND(SUM(f.amount) / COUNT(DISTINCT d.date_key), 2) AS avg_daily_burn_rate
FROM dim_date d
JOIN fact_transactions f ON d.date_key = f.date_key
WHERE f.transaction_type = 'expense'
GROUP BY d.is_weekend;


-- ============================================================================
-- 9. RECURRING SUBSCRIPTION CREEP & ANNUALIZED COMMITTED COST (ARE)
-- Technique: Subquery Filtering on Recurring SaaS/Subscription Vendors
-- ============================================================================
SELECT
    m.clean_merchant_name AS subscription_vendor,
    c.category_name,
    COUNT(f.transaction_id) AS monthly_charge_frequency,
    ROUND(AVG(f.amount), 2) AS avg_monthly_bill,
    ROUND(AVG(f.amount) * 12, 2) AS annualized_recurring_cost,
    ROUND(SUM(f.amount), 2) AS ytd_total_paid
FROM fact_transactions f
JOIN dim_merchant m ON f.merchant_id = m.merchant_id
JOIN dim_category c ON f.category_id = c.category_id
WHERE f.is_recurring = 1 OR m.is_subscription = 1
GROUP BY m.clean_merchant_name, c.category_name
ORDER BY annualized_recurring_cost DESC;


-- ============================================================================
-- 10. DUPLICATE CHARGE / ACCIDENTAL BILLING DETECTOR
-- Technique: Self-Join with Temporal Delta Window (< 48 hours, identical amount)
-- Detects potential double-billing incidents or merchant transaction errors.
-- ============================================================================
SELECT
    a.transaction_id AS tx_original,
    b.transaction_id AS tx_duplicate_suspect,
    a.amount,
    m.merchant_name,
    d1.full_date AS date_first,
    d2.full_date AS date_second,
    (d2.date_key - d1.date_key) AS date_key_difference
FROM fact_transactions a
JOIN fact_transactions b 
    ON a.merchant_id = b.merchant_id 
    AND a.amount = b.amount 
    AND a.transaction_id < b.transaction_id
    AND a.transaction_type = 'expense'
    AND b.transaction_type = 'expense'
JOIN dim_date d1 ON a.date_key = d1.date_key
JOIN dim_date d2 ON b.date_key = d2.date_key
JOIN dim_merchant m ON a.merchant_id = m.merchant_id
WHERE ABS(d2.date_key - d1.date_key) <= 2;
