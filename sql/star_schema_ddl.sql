-- ============================================================================
-- Enterprise Financial Analytics Platform: Dimensional Star Schema DDL
-- Compatible with PostgreSQL, Snowflake, DuckDB, SQLite, and AlaSQL
-- ============================================================================

-- Drop tables if re-initializing (in reverse foreign-key order)
DROP TABLE IF EXISTS fact_transactions;
DROP TABLE IF EXISTS dim_payment_method;
DROP TABLE IF EXISTS dim_merchant;
DROP TABLE IF EXISTS dim_category;
DROP TABLE IF EXISTS dim_date;

-- ----------------------------------------------------------------------------
-- 1. DIM_DATE: Calendar & Temporal Dimension
-- ----------------------------------------------------------------------------
CREATE TABLE dim_date (
    date_key            INTEGER PRIMARY KEY,           -- YYYYMMDD (e.g. 20261015)
    full_date           DATE NOT NULL,                 -- 2026-10-15
    day_of_week_num     SMALLINT NOT NULL,             -- 1 (Monday) to 7 (Sunday)
    day_name            VARCHAR(10) NOT NULL,          -- 'Monday', 'Tuesday', etc.
    is_weekend          BOOLEAN NOT NULL,              -- 1 for Saturday & Sunday
    week_of_year        SMALLINT NOT NULL,             -- 1 to 53
    month_num           SMALLINT NOT NULL,             -- 1 to 12
    month_name          VARCHAR(10) NOT NULL,          -- 'January', etc.
    quarter             VARCHAR(2) NOT NULL,           -- 'Q1', 'Q2', 'Q3', 'Q4'
    year                SMALLINT NOT NULL,             -- 2025, 2026
    fiscal_year         SMALLINT NOT NULL,             -- Custom fiscal year mapping
    fiscal_quarter      VARCHAR(2) NOT NULL            -- 'FQ1', 'FQ2', etc.
);

CREATE INDEX idx_dim_date_full_date ON dim_date(full_date);
CREATE INDEX idx_dim_date_year_month ON dim_date(year, month_num);

-- ----------------------------------------------------------------------------
-- 2. DIM_CATEGORY: Spend & Revenue Classification
-- ----------------------------------------------------------------------------
CREATE TABLE dim_category (
    category_id         VARCHAR(32) PRIMARY KEY,       -- e.g. 'cat_food_dining'
    category_name       VARCHAR(64) NOT NULL,          -- 'Food & Dining'
    category_type       VARCHAR(10) NOT NULL,          -- 'expense' or 'income'
    budget_cap          DECIMAL(12, 2) DEFAULT 0.00,   -- Target monthly allocation
    is_discretionary    BOOLEAN DEFAULT 1,             -- 1: Flexible, 0: Fixed / Essential
    icon                VARCHAR(32) DEFAULT 'tag',     -- Lucide icon identifier
    color_hex           VARCHAR(7) DEFAULT '#6366f1',  -- Visualization palette hex
    is_active           BOOLEAN DEFAULT 1
);

CREATE INDEX idx_dim_category_type ON dim_category(category_type);

-- ----------------------------------------------------------------------------
-- 3. DIM_MERCHANT: Payee / Counterparty Dimension
-- ----------------------------------------------------------------------------
CREATE TABLE dim_merchant (
    merchant_id         VARCHAR(32) PRIMARY KEY,       -- e.g. 'merch_wholefoods'
    merchant_name       VARCHAR(128) NOT NULL,         -- 'Whole Foods Market'
    clean_merchant_name VARCHAR(128) NOT NULL,         -- Standardized regex entity
    is_subscription     BOOLEAN DEFAULT 0,             -- Recurring SaaS / Membership
    risk_tier           VARCHAR(16) DEFAULT 'standard' -- 'standard', 'high_ticket', etc.
);

CREATE INDEX idx_dim_merchant_clean_name ON dim_merchant(clean_merchant_name);

-- ----------------------------------------------------------------------------
-- 4. DIM_PAYMENT_METHOD: Settlement Channels
-- ----------------------------------------------------------------------------
CREATE TABLE dim_payment_method (
    payment_method_id   VARCHAR(32) PRIMARY KEY,       -- e.g. 'pm_credit_card'
    payment_method_name VARCHAR(64) NOT NULL,          -- 'Credit Card'
    channel_type        VARCHAR(32) NOT NULL,          -- 'card', 'bank', 'cash', 'upi'
    processing_fee_pct  DECIMAL(4, 2) DEFAULT 0.00     -- Processing fee percentage
);

-- ----------------------------------------------------------------------------
-- 5. FACT_TRANSACTIONS: Central Transactional Fact Table
-- Grain: One row per discrete debit/credit financial transaction event
-- ----------------------------------------------------------------------------
CREATE TABLE fact_transactions (
    transaction_id      VARCHAR(36) PRIMARY KEY,       -- UUID v4
    date_key            INTEGER NOT NULL,              -- FK -> dim_date.date_key
    category_id         VARCHAR(32) NOT NULL,          -- FK -> dim_category.category_id
    merchant_id         VARCHAR(32) NOT NULL,          -- FK -> dim_merchant.merchant_id
    payment_method_id   VARCHAR(32) NOT NULL,          -- FK -> dim_payment_method.payment_method_id
    transaction_type    VARCHAR(10) NOT NULL,          -- 'expense' | 'income'
    amount              DECIMAL(12, 2) NOT NULL,       -- Absolute magnitude
    is_recurring        BOOLEAN DEFAULT 0,             -- Automated recurring charge flag
    is_anomaly          BOOLEAN DEFAULT 0,             -- Statistical outlier flag
    anomaly_score       DECIMAL(6, 2) DEFAULT 0.00,    -- Modified Z-score or IQR distance
    notes               TEXT,                          -- Memo / audit notes
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tx_date FOREIGN KEY (date_key) REFERENCES dim_date(date_key),
    CONSTRAINT fk_tx_category FOREIGN KEY (category_id) REFERENCES dim_category(category_id),
    CONSTRAINT fk_tx_merchant FOREIGN KEY (merchant_id) REFERENCES dim_merchant(merchant_id),
    CONSTRAINT fk_tx_pm FOREIGN KEY (payment_method_id) REFERENCES dim_payment_method(payment_method_id)
);

CREATE INDEX idx_fact_tx_date_key ON fact_transactions(date_key);
CREATE INDEX idx_fact_tx_category ON fact_transactions(category_id);
CREATE INDEX idx_fact_tx_merchant ON fact_transactions(merchant_id);
CREATE INDEX idx_fact_tx_type ON fact_transactions(transaction_type);
CREATE INDEX idx_fact_tx_amount ON fact_transactions(amount);
CREATE INDEX idx_fact_tx_anomaly ON fact_transactions(is_anomaly);
