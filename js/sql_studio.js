/**
 * In-Browser OLAP SQL Studio (Powered by AlaSQL)
 * =============================================
 * Creates an in-memory SQL database with the Kimball Star Schema:
 * - fact_transactions
 * - dim_date
 * - dim_category
 * - dim_merchant
 * - dim_payment_method
 * 
 * Supports full SQL joins, CTEs, Window functions (LAG, RANK, DENSE_RANK, SUM() OVER),
 * live query execution, execution latency tracking, and CSV export.
 */

class SQLStudio {
  static isInitialized = false;
  static currentResults = [];

  static PRESET_QUERIES = [
    {
      id: 'mom_variance',
      name: '1. Month-Over-Month Spend Growth (LAG Window Function)',
      description: 'Calculates monthly spend, prior month spend via LAG(), absolute variance, and MoM growth %.',
      sql: `SELECT 
    d.year,
    d.month_name,
    ROUND(SUM(f.amount), 2) AS current_month_spend,
    ROUND(LAG(SUM(f.amount), 1) OVER (ORDER BY d.year, d.month_num), 2) AS prior_month_spend,
    ROUND(SUM(f.amount) - LAG(SUM(f.amount), 1) OVER (ORDER BY d.year, d.month_num), 2) AS abs_change,
    ROUND(
        (SUM(f.amount) - LAG(SUM(f.amount), 1) OVER (ORDER BY d.year, d.month_num)) * 100.0 / 
        LAG(SUM(f.amount), 1) OVER (ORDER BY d.year, d.month_num), 1
    ) AS mom_growth_pct
FROM fact_transactions f
JOIN dim_date d ON f.date_key = d.date_key
WHERE f.transaction_type = 'expense'
GROUP BY d.year, d.month_num, d.month_name
ORDER BY d.year DESC, d.month_num DESC`
    },
    {
      id: 'pareto_analysis',
      name: '2. Pareto 80/20 Analysis (Cumulative Window Sum)',
      description: 'Identifies the vital few spending categories that drive 80% of aggregate outflow.',
      sql: `SELECT 
    c.category_name,
    c.is_discretionary,
    ROUND(SUM(f.amount), 2) AS total_category_spend,
    ROUND(SUM(f.amount) * 100.0 / SUM(SUM(f.amount)) OVER (), 1) AS category_share_pct,
    ROUND(
        SUM(SUM(f.amount)) OVER (ORDER BY SUM(f.amount) DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) * 100.0 / 
        SUM(SUM(f.amount)) OVER (), 1
    ) AS cumulative_share_pct
FROM fact_transactions f
JOIN dim_category c ON f.category_id = c.category_id
WHERE f.transaction_type = 'expense'
GROUP BY c.category_name, c.is_discretionary
ORDER BY total_category_spend DESC`
    },
    {
      id: 'top_categories_rank',
      name: '3. Top 3 Categories per Month (DENSE_RANK Partition)',
      description: 'Partitions monthly expenditures and ranks top spending categories using DENSE_RANK().',
      sql: `SELECT 
    year,
    month_name,
    spend_rank,
    category_name,
    ROUND(category_spend, 2) AS spend_amount
FROM (
    SELECT 
        d.year,
        d.month_num,
        d.month_name,
        c.category_name,
        SUM(f.amount) AS category_spend,
        DENSE_RANK() OVER (PARTITION BY d.year, d.month_num ORDER BY SUM(f.amount) DESC) AS spend_rank
    FROM fact_transactions f
    JOIN dim_date d ON f.date_key = d.date_key
    JOIN dim_category c ON f.category_id = c.category_id
    WHERE f.transaction_type = 'expense'
    GROUP BY d.year, d.month_num, d.month_name, c.category_name
)
WHERE spend_rank <= 3
ORDER BY year DESC, month_num DESC, spend_rank ASC`
    },
    {
      id: 'weekend_vs_weekday',
      name: '4. Weekend vs. Weekday Spend Elasticity',
      description: 'Quantifies behavioral impulse spending on weekends vs. planned weekday transactions.',
      sql: `SELECT 
    CASE WHEN d.is_weekend = 1 THEN 'Weekend (Sat-Sun)' ELSE 'Weekday (Mon-Fri)' END AS day_classification,
    COUNT(f.transaction_id) AS total_transactions,
    ROUND(SUM(f.amount), 2) AS total_expenditure,
    ROUND(AVG(f.amount), 2) AS avg_ticket_size,
    ROUND(SUM(f.amount) * 100.0 / SUM(SUM(f.amount)) OVER (), 1) AS share_of_total_pct
FROM fact_transactions f
JOIN dim_date d ON f.date_key = d.date_key
WHERE f.transaction_type = 'expense'
GROUP BY d.is_weekend`
    },
    {
      id: 'subscription_runrate',
      name: '5. Recurring Subscriptions & Annualized Committed Cost',
      description: 'Audits recurring SaaS & utility subscriptions and estimates Annual Recurring Outflow.',
      sql: `SELECT 
    m.clean_merchant_name AS subscription_vendor,
    c.category_name,
    COUNT(f.transaction_id) AS billing_count,
    ROUND(AVG(f.amount), 2) AS avg_monthly_bill,
    ROUND(AVG(f.amount) * 12, 2) AS annualized_cost,
    ROUND(SUM(f.amount), 2) AS ytd_total_paid
FROM fact_transactions f
JOIN dim_merchant m ON f.merchant_id = m.merchant_id
JOIN dim_category c ON f.category_id = c.category_id
WHERE f.is_recurring = 1 OR m.is_subscription = 1
GROUP BY m.clean_merchant_name, c.category_name
ORDER BY annualized_cost DESC`
    },
    {
      id: 'budget_variance',
      name: '6. Budget Burn & Surplus/Deficit Variance',
      description: 'Calculates budget utilization and variance against predefined allocation caps.',
      sql: `SELECT 
    c.category_name,
    c.budget_cap,
    ROUND(SUM(f.amount), 2) AS actual_spend,
    ROUND(c.budget_cap - SUM(f.amount), 2) AS variance,
    ROUND(SUM(f.amount) * 100.0 / c.budget_cap, 1) AS utilization_pct,
    CASE 
        WHEN SUM(f.amount) > c.budget_cap THEN 'OVER BUDGET'
        WHEN SUM(f.amount) >= (c.budget_cap * 0.85) THEN 'WARNING (85%+)'
        ELSE 'ON TRACK'
    END AS budget_status
FROM dim_category c
JOIN fact_transactions f ON c.category_id = f.category_id
WHERE f.transaction_type = 'expense' AND c.budget_cap > 0
GROUP BY c.category_name, c.budget_cap
ORDER BY utilization_pct DESC`
    }
  ];

  static initDatabase(transactions, budgets = {}) {
    if (typeof alasql === 'undefined') {
      console.warn('AlaSQL not loaded yet. Retrying...');
      return;
    }

    try {
      // Re-create tables
      alasql('DROP TABLE IF EXISTS fact_transactions');
      alasql('DROP TABLE IF EXISTS dim_payment_method');
      alasql('DROP TABLE IF EXISTS dim_merchant');
      alasql('DROP TABLE IF EXISTS dim_category');
      alasql('DROP TABLE IF EXISTS dim_date');

      alasql(`
        CREATE TABLE dim_date (
          date_key INT,
          full_date STRING,
          day_of_week INT,
          day_name STRING,
          is_weekend INT,
          month_num INT,
          month_name STRING,
          quarter STRING,
          year INT
        );
        CREATE TABLE dim_category (
          category_id STRING,
          category_name STRING,
          category_type STRING,
          budget_cap FLOAT,
          is_discretionary INT
        );
        CREATE TABLE dim_merchant (
          merchant_id STRING,
          merchant_name STRING,
          clean_merchant_name STRING,
          is_subscription INT
        );
        CREATE TABLE dim_payment_method (
          payment_method_id STRING,
          payment_method_name STRING,
          channel_type STRING
        );
        CREATE TABLE fact_transactions (
          transaction_id STRING,
          date_key INT,
          category_id STRING,
          merchant_id STRING,
          payment_method_id STRING,
          transaction_type STRING,
          amount FLOAT,
          is_recurring INT,
          is_anomaly INT,
          anomaly_score FLOAT,
          notes STRING
        );
      `);

      // Populate Dimensions & Facts
      const dimDates = {};
      const dimCategories = {};
      const dimMerchants = {};
      const dimPaymentMethods = {};
      const factRows = [];

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

      transactions.forEach(t => {
        const dt = new Date(t.date);
        const y = dt.getFullYear();
        const m = dt.getMonth() + 1;
        const d = dt.getDate();
        const dateKey = parseInt(`${y}${m < 10 ? '0' + m : m}${d < 10 ? '0' + d : d}`, 10);

        if (!dimDates[dateKey]) {
          dimDates[dateKey] = {
            date_key: dateKey,
            full_date: t.date,
            day_of_week: dt.getDay(),
            day_name: dayNames[dt.getDay()],
            is_weekend: (dt.getDay() === 0 || dt.getDay() === 6) ? 1 : 0,
            month_num: m,
            month_name: monthNames[dt.getMonth()],
            quarter: `Q${Math.floor(dt.getMonth() / 3) + 1}`,
            year: y
          };
        }

        const catId = 'cat_' + t.category.toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (!dimCategories[catId]) {
          const cap = budgets[t.category] || 500;
          const isDisc = ['Housing & Rent', 'Utilities & Bills', 'Healthcare', 'Salary'].includes(t.category) ? 0 : 1;
          dimCategories[catId] = {
            category_id: catId,
            category_name: t.category,
            category_type: t.type,
            budget_cap: cap,
            is_discretionary: isDisc
          };
        }

        const rawMerchant = (t.merchant || t.title || 'Unknown Vendor').trim();
        let cleanName = rawMerchant.replace(/[#\*]\S+/g, '').trim();
        if (/netflix/i.test(rawMerchant)) cleanName = 'Netflix';
        if (/spotify/i.test(rawMerchant)) cleanName = 'Spotify';
        if (/amazon|amzn/i.test(rawMerchant)) cleanName = 'Amazon';
        if (/trader joe/i.test(rawMerchant)) cleanName = "Trader Joe's";
        if (/whole foods/i.test(rawMerchant)) cleanName = "Whole Foods";

        const merchId = 'merch_' + cleanName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
        if (!dimMerchants[merchId]) {
          dimMerchants[merchId] = {
            merchant_id: merchId,
            merchant_name: rawMerchant,
            clean_merchant_name: cleanName,
            is_subscription: (t.isRecurring || /netflix|spotify|spectrum|at&t/i.test(cleanName)) ? 1 : 0
          };
        }

        const pmName = t.paymentMethod || 'Credit Card';
        const pmId = 'pm_' + pmName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
        if (!dimPaymentMethods[pmId]) {
          dimPaymentMethods[pmId] = {
            payment_method_id: pmId,
            payment_method_name: pmName,
            channel_type: pmName.includes('Card') ? 'card' : (pmName.includes('Bank') ? 'bank' : 'wallet')
          };
        }

        factRows.push({
          transaction_id: t.id || 'tx_' + Math.random().toString(36).substr(2, 9),
          date_key: dateKey,
          category_id: catId,
          merchant_id: merchId,
          payment_method_id: pmId,
          transaction_type: t.type,
          amount: parseFloat(t.amount) || 0.0,
          is_recurring: t.isRecurring ? 1 : 0,
          is_anomaly: t.isAnomaly ? 1 : 0,
          anomaly_score: t.anomalyScore || 0.0,
          notes: t.notes || t.title || ''
        });
      });

      // Bulk Insert into AlaSQL
      alasql.tables.dim_date.data = Object.values(dimDates);
      alasql.tables.dim_category.data = Object.values(dimCategories);
      alasql.tables.dim_merchant.data = Object.values(dimMerchants);
      alasql.tables.dim_payment_method.data = Object.values(dimPaymentMethods);
      alasql.tables.fact_transactions.data = factRows;

      this.isInitialized = true;
      console.log(`[SQLStudio] In-memory Star Schema loaded with ${factRows.length} facts.`);
    } catch (err) {
      console.error('[SQLStudio] Initialization failed:', err);
    }
  }

  static executeQuery(sqlString) {
    if (!this.isInitialized || typeof alasql === 'undefined') {
      return { success: false, error: 'Database not initialized yet.', latencyMs: 0 };
    }

    const startTime = performance.now();
    try {
      const results = alasql(sqlString);
      const endTime = performance.now();
      const latencyMs = Math.round((endTime - startTime) * 10) / 10;
      this.currentResults = results;
      return {
        success: true,
        data: results,
        rowCount: Array.isArray(results) ? results.length : 1,
        latencyMs
      };
    } catch (err) {
      const endTime = performance.now();
      return {
        success: false,
        error: err.message || 'SQL Execution Error',
        latencyMs: Math.round((endTime - startTime) * 10) / 10
      };
    }
  }

  static exportResultsToCSV(filename = 'sql_query_export.csv') {
    if (!this.currentResults || this.currentResults.length === 0) return;

    const headers = Object.keys(this.currentResults[0]);
    const csvRows = [headers.join(',')];

    this.currentResults.forEach(row => {
      const values = headers.map(h => {
        const val = row[h];
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return val !== null && val !== undefined ? val : '';
      });
      csvRows.push(values.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
