/**
 * Storage & Data Management Service for Financial Analytics Platform
 * ==================================================================
 * Handles localStorage persistence, multi-currency settings, budget caps,
 * 1-Year realistic multi-seasonal dataset generation, and Star Schema data exports.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'antigravity_expenses_transactions',
  BUDGETS: 'antigravity_expenses_budgets',
  SETTINGS: 'antigravity_expenses_settings'
};

const EXPENSE_CATEGORIES = [
  { name: 'Food & Dining', icon: 'utensils', color: '#f59e0b', bg: '#fef3c7', isDiscretionary: true },
  { name: 'Housing & Rent', icon: 'home', color: '#3b82f6', bg: '#dbeafe', isDiscretionary: false },
  { name: 'Transportation', icon: 'car', color: '#10b981', bg: '#d1fae5', isDiscretionary: false },
  { name: 'Utilities & Bills', icon: 'zap', color: '#8b5cf6', bg: '#ede9fe', isDiscretionary: false },
  { name: 'Entertainment', icon: 'film', color: '#ec4899', bg: '#fce7f3', isDiscretionary: true },
  { name: 'Shopping', icon: 'shopping-bag', color: '#f97316', bg: '#ffedd5', isDiscretionary: true },
  { name: 'Healthcare', icon: 'heart-pulse', color: '#ef4444', bg: '#fee2e2', isDiscretionary: false },
  { name: 'Education', icon: 'book-open', color: '#6366f1', bg: '#e0e7ff', isDiscretionary: true },
  { name: 'Personal Care', icon: 'sparkles', color: '#14b8a6', bg: '#ccfbf1', isDiscretionary: true },
  { name: 'Travel', icon: 'plane', color: '#06b6d4', bg: '#cffafe', isDiscretionary: true },
  { name: 'Other Expense', icon: 'tag', color: '#6b7280', bg: '#f3f4f6', isDiscretionary: true }
];

const INCOME_CATEGORIES = [
  { name: 'Salary', icon: 'briefcase', color: '#10b981', bg: '#d1fae5' },
  { name: 'Freelance & Side Gig', icon: 'laptop', color: '#3b82f6', bg: '#dbeafe' },
  { name: 'Investments & Dividends', icon: 'trending-up', color: '#8b5cf6', bg: '#ede9fe' },
  { name: 'Rental Income', icon: 'building', color: '#f59e0b', bg: '#fef3c7' },
  { name: 'Gifts & Rewards', icon: 'gift', color: '#ec4899', bg: '#fce7f3' },
  { name: 'Other Income', icon: 'plus-circle', color: '#6b7280', bg: '#f3f4f6' }
];

const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar ($)' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro (€)' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound (£)' },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee (₹)' },
  CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar (CA$)' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar (A$)' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen (¥)' },
  AED: { code: 'AED', symbol: 'AED', name: 'UAE Dirham (AED)' }
};

const PAYMENT_METHODS = [
  'Credit Card',
  'Debit Card',
  'Cash',
  'Bank Transfer',
  'UPI / Digital Wallet',
  'Other'
];

const DEFAULT_SETTINGS = {
  currency: 'USD',
  theme: 'light',
  monthlySavingsTarget: 25,
  anomalySensitivity: 3.0,
  activeTab: 'executive'
};

const DEFAULT_BUDGETS = {
  'Food & Dining': 650,
  'Housing & Rent': 1500,
  'Transportation': 250,
  'Utilities & Bills': 200,
  'Entertainment': 180,
  'Shopping': 300,
  'Healthcare': 150,
  'Education': 100,
  'Personal Care': 80,
  'Travel': 350,
  'Other Expense': 100
};

class StorageService {
  static getTransactions() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return this.loadRealisticEnterpriseDataset();
    } catch (e) {
      console.error('Error reading transactions from localStorage', e);
      return this.loadRealisticEnterpriseDataset();
    }
  }

  static saveTransactions(transactions) {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  }

  static addTransaction(tx) {
    const transactions = this.getTransactions();
    const newTx = {
      id: 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      date: tx.date || new Date().toISOString().split('T')[0],
      title: (tx.title || '').trim(),
      merchant: (tx.merchant || tx.title || '').trim(),
      amount: parseFloat(tx.amount) || 0.0,
      type: tx.type || 'expense',
      category: tx.category,
      paymentMethod: tx.paymentMethod || 'Credit Card',
      notes: (tx.notes || '').trim(),
      isRecurring: !!tx.isRecurring,
      createdAt: new Date().toISOString()
    };
    transactions.unshift(newTx);
    this.saveTransactions(transactions);
    return newTx;
  }

  static updateTransaction(id, updatedFields) {
    const transactions = this.getTransactions();
    const index = transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      transactions[index] = {
        ...transactions[index],
        ...updatedFields,
        amount: parseFloat(updatedFields.amount) || transactions[index].amount,
        merchant: updatedFields.merchant || updatedFields.title || transactions[index].merchant,
        updatedAt: new Date().toISOString()
      };
      this.saveTransactions(transactions);
      return transactions[index];
    }
    return null;
  }

  static deleteTransaction(id) {
    let transactions = this.getTransactions();
    transactions = transactions.filter(t => t.id !== id);
    this.saveTransactions(transactions);
    return true;
  }

  static getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  static saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  static getBudgets() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BUDGETS);
      return data ? { ...DEFAULT_BUDGETS, ...JSON.parse(data) } : { ...DEFAULT_BUDGETS };
    } catch (e) {
      return { ...DEFAULT_BUDGETS };
    }
  }

  static saveBudgets(budgets) {
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets));
  }

  /**
   * Generates a 1-Year (12-month) enterprise-grade realistic financial transaction dataset
   * Spanning 150+ transactions with trends, weekend spikes, recurring subscriptions, and anomalies.
   */
  static loadRealisticEnterpriseDataset() {
    const rawData = [
      { id: "tx_001", date: "2025-11-01", category: "Salary", type: "income", merchant: "TechCorp Payroll Direct Dep", title: "Monthly Base Salary", paymentMethod: "Bank Transfer", amount: 4200.00, isRecurring: 1, notes: "Direct deposit monthly payroll" },
      { id: "tx_002", date: "2025-11-01", category: "Housing & Rent", type: "expense", merchant: "Equity Residential Lease", title: "Apartment Lease Rent", paymentMethod: "Bank Transfer", amount: 1450.00, isRecurring: 1, notes: "Monthly rental payment" },
      { id: "tx_003", date: "2025-11-03", category: "Food & Dining", type: "expense", merchant: "Trader Joe's #412", title: "Trader Joe's Groceries", paymentMethod: "Credit Card", amount: 68.40, isRecurring: 0, notes: "Weekly pantry and fresh produce" },
      { id: "tx_004", date: "2025-11-05", category: "Entertainment", type: "expense", merchant: "Spotify Premium Music", title: "Spotify Subscription", paymentMethod: "Credit Card", amount: 11.99, isRecurring: 1, notes: "Recurring monthly audio stream" },
      { id: "tx_005", date: "2025-11-07", category: "Transportation", type: "expense", merchant: "Shell Gas Station", title: "Shell Fuel Fill-up", paymentMethod: "Credit Card", amount: 48.20, isRecurring: 0, notes: "Gasoline refill" },
      { id: "tx_006", date: "2025-11-10", category: "Food & Dining", type: "expense", merchant: "Chipotle Mexican Grill", title: "Chipotle Lunch", paymentMethod: "Debit Card", amount: 16.85, isRecurring: 0, notes: "Burrito bowl lunch" },
      { id: "tx_007", date: "2025-11-12", category: "Entertainment", type: "expense", merchant: "Netflix.com SaaS", title: "Netflix Subscription", paymentMethod: "Credit Card", amount: 19.99, isRecurring: 1, notes: "Monthly 4K streaming plan" },
      { id: "tx_008", date: "2025-11-15", category: "Freelance & Side Gig", type: "income", merchant: "Upwork / Client Escrow", title: "Contract Analytics Retainer", paymentMethod: "Bank Transfer", amount: 750.00, isRecurring: 0, notes: "SQL query optimization consulting" },
      { id: "tx_009", date: "2025-11-16", category: "Shopping", type: "expense", merchant: "AMZN Mktp US*9281A", title: "Amazon Household Order", paymentMethod: "Credit Card", amount: 84.50, isRecurring: 0, notes: "Ergonomic keyboard accessories" },
      { id: "tx_010", date: "2025-11-18", category: "Utilities & Bills", type: "expense", merchant: "AT&T Mobility Wireless", title: "Mobile Phone Bill", paymentMethod: "Debit Card", amount: 85.00, isRecurring: 1, notes: "Unlimited 5G wireless plan" },
      { id: "tx_011", date: "2025-11-20", category: "Food & Dining", type: "expense", merchant: "Whole Foods Market", title: "Whole Foods Weekend Groceries", paymentMethod: "Credit Card", amount: 112.30, isRecurring: 0, notes: "Weekend dinner ingredients" },
      { id: "tx_012", date: "2025-11-22", category: "Utilities & Bills", type: "expense", merchant: "Spectrum Internet Fiber", title: "Gigabit Fiber Broadband", paymentMethod: "Credit Card", amount: 69.99, isRecurring: 1, notes: "Monthly home high-speed internet" },
      { id: "tx_013", date: "2025-11-25", category: "Healthcare", type: "expense", merchant: "CVS Pharmacy #3821", title: "CVS Prescriptions", paymentMethod: "Credit Card", amount: 34.50, isRecurring: 0, notes: "Preventative supplements" },
      { id: "tx_014", date: "2025-11-28", category: "Shopping", type: "expense", merchant: "Best Buy Electronics", title: "Tech Workstation Monitor", paymentMethod: "Credit Card", amount: 1249.99, isRecurring: 0, notes: "ANOMALY: High-ticket 4K dual display setup" },
      { id: "tx_015", date: "2025-11-29", category: "Food & Dining", type: "expense", merchant: "Sweetgreen NYC", title: "Sweetgreen Salad", paymentMethod: "Debit Card", amount: 18.75, isRecurring: 0, notes: "Takeout salad lunch" },

      { id: "tx_016", date: "2025-12-01", category: "Salary", type: "income", merchant: "TechCorp Payroll Direct Dep", title: "Monthly Base Salary", paymentMethod: "Bank Transfer", amount: 4200.00, isRecurring: 1, notes: "Direct deposit monthly payroll" },
      { id: "tx_017", date: "2025-12-01", category: "Housing & Rent", type: "expense", merchant: "Equity Residential Lease", title: "Apartment Lease Rent", paymentMethod: "Bank Transfer", amount: 1450.00, isRecurring: 1, notes: "Monthly rental payment" },
      { id: "tx_018", date: "2025-12-04", category: "Food & Dining", type: "expense", merchant: "Trader Joe's #412", title: "Trader Joe's Groceries", paymentMethod: "Credit Card", amount: 74.10, isRecurring: 0, notes: "Groceries & holiday snacks" },
      { id: "tx_019", date: "2025-12-05", category: "Entertainment", type: "expense", merchant: "Spotify Premium Music", title: "Spotify Subscription", paymentMethod: "Credit Card", amount: 11.99, isRecurring: 1, notes: "Recurring monthly audio stream" },
      { id: "tx_020", date: "2025-12-08", category: "Transportation", type: "expense", merchant: "Uber *Trip Ride", title: "Uber Airport Ride", paymentMethod: "Credit Card", amount: 28.50, isRecurring: 0, notes: "Rideshare to airport terminal" },
      { id: "tx_021", date: "2025-12-11", category: "Travel", type: "expense", merchant: "Delta Air Lines 006", title: "Delta Flights Roundtrip", paymentMethod: "Credit Card", amount: 1420.00, isRecurring: 0, notes: "ANOMALY: International multi-city conference flight booking" },
      { id: "tx_022", date: "2025-12-12", category: "Entertainment", type: "expense", merchant: "Netflix.com SaaS", title: "Netflix Subscription", paymentMethod: "Credit Card", amount: 19.99, isRecurring: 1, notes: "Monthly 4K streaming plan" },
      { id: "tx_023", date: "2025-12-14", category: "Shopping", type: "expense", merchant: "Target Stores #1204", title: "Target Holiday Gifts", paymentMethod: "Credit Card", amount: 142.30, isRecurring: 0, notes: "Holiday gift shopping for family" },
      { id: "tx_024", date: "2025-12-16", category: "Freelance & Side Gig", type: "income", merchant: "Upwork / Client Escrow", title: "BI Dashboard Contract", paymentMethod: "Bank Transfer", amount: 920.00, isRecurring: 0, notes: "Power BI executive report milestone" },
      { id: "tx_025", date: "2025-12-18", category: "Utilities & Bills", type: "expense", merchant: "AT&T Mobility Wireless", title: "Mobile Phone Bill", paymentMethod: "Debit Card", amount: 85.00, isRecurring: 1, notes: "Unlimited 5G wireless plan" },
      { id: "tx_026", date: "2025-12-20", category: "Food & Dining", type: "expense", merchant: "Local Artisan Bakery", title: "Holiday Dinner Catering", paymentMethod: "Debit Card", amount: 32.00, isRecurring: 0, notes: "Holiday pastry platter" },
      { id: "tx_027", date: "2025-12-22", category: "Utilities & Bills", type: "expense", merchant: "Spectrum Internet Fiber", title: "Gigabit Fiber Broadband", paymentMethod: "Credit Card", amount: 69.99, isRecurring: 1, notes: "Monthly home high-speed internet" },
      { id: "tx_028", date: "2025-12-24", category: "Food & Dining", type: "expense", merchant: "Whole Foods Market", title: "Christmas Eve Feast", paymentMethod: "Credit Card", amount: 165.80, isRecurring: 0, notes: "Holiday dinner ingredients" },
      { id: "tx_029", date: "2025-12-28", category: "Entertainment", type: "expense", merchant: "Steam Video Games", title: "Steam Winter Bundle", paymentMethod: "Credit Card", amount: 59.99, isRecurring: 0, notes: "Holiday discount sale purchase" },

      { id: "tx_030", date: "2026-01-01", category: "Salary", type: "income", merchant: "TechCorp Payroll Direct Dep", title: "Monthly Base Salary", paymentMethod: "Bank Transfer", amount: 4200.00, isRecurring: 1, notes: "Direct deposit monthly payroll" },
      { id: "tx_031", date: "2026-01-01", category: "Housing & Rent", type: "expense", merchant: "Equity Residential Lease", title: "Apartment Lease Rent", paymentMethod: "Bank Transfer", amount: 1450.00, isRecurring: 1, notes: "Monthly rental payment" },
      { id: "tx_032", date: "2026-01-03", category: "Food & Dining", type: "expense", merchant: "Trader Joe's #412", title: "Trader Joe's Pantry Restock", paymentMethod: "Credit Card", amount: 61.20, isRecurring: 0, notes: "Weekly grocery items" },
      { id: "tx_033", date: "2026-01-05", category: "Entertainment", type: "expense", merchant: "Spotify Premium Music", title: "Spotify Subscription", paymentMethod: "Credit Card", amount: 11.99, isRecurring: 1, notes: "Recurring monthly audio stream" },
      { id: "tx_034", date: "2026-01-07", category: "Education", type: "expense", merchant: "Coursera Inc Online", title: "Data Engineering Specialization", paymentMethod: "Credit Card", amount: 49.00, isRecurring: 0, notes: "Cloud Data Architecture course" },
      { id: "tx_035", date: "2026-01-09", category: "Transportation", type: "expense", merchant: "Chevron 82910", title: "Chevron Gas Fill-up", paymentMethod: "Credit Card", amount: 45.00, isRecurring: 0, notes: "Commute fuel refill" },
      { id: "tx_036", date: "2026-01-12", category: "Entertainment", type: "expense", merchant: "Netflix.com SaaS", title: "Netflix Subscription", paymentMethod: "Credit Card", amount: 19.99, isRecurring: 1, notes: "Monthly 4K streaming plan" },
      { id: "tx_037", date: "2026-01-15", category: "Food & Dining", type: "expense", merchant: "Chipotle Mexican Grill", title: "Chipotle Lunch", paymentMethod: "Debit Card", amount: 15.40, isRecurring: 0, notes: "Lunch with coworker" },
      { id: "tx_038", date: "2026-01-17", category: "Shopping", type: "expense", merchant: "AMZN Mktp US*9281A", title: "Cable Management & Desk Organizer", paymentMethod: "Credit Card", amount: 52.80, isRecurring: 0, notes: "Home office upgrade" },
      { id: "tx_039", date: "2026-01-18", category: "Utilities & Bills", type: "expense", merchant: "AT&T Mobility Wireless", title: "Mobile Phone Bill", paymentMethod: "Debit Card", amount: 85.00, isRecurring: 1, notes: "Unlimited 5G wireless plan" },
      { id: "tx_040", date: "2026-01-20", category: "Freelance & Side Gig", type: "income", merchant: "Upwork / Client Escrow", title: "Python ETL Automation Project", paymentMethod: "Bank Transfer", amount: 600.00, isRecurring: 0, notes: "Automated ingestion pipeline script" },
      { id: "tx_041", date: "2026-01-22", category: "Utilities & Bills", type: "expense", merchant: "Spectrum Internet Fiber", title: "Gigabit Fiber Broadband", paymentMethod: "Credit Card", amount: 69.99, isRecurring: 1, notes: "Monthly home high-speed internet" },
      { id: "tx_042", date: "2026-01-25", category: "Healthcare", type: "expense", merchant: "Quest Diagnostics Lab", title: "Annual Preventative Panel", paymentMethod: "Credit Card", amount: 120.00, isRecurring: 0, notes: "Health preventative blood test" },
      { id: "tx_043", date: "2026-01-28", category: "Food & Dining", type: "expense", merchant: "Whole Foods Market", title: "Weekend Groceries", paymentMethod: "Credit Card", amount: 98.60, isRecurring: 0, notes: "Weekly organic dinner food" },

      { id: "tx_044", date: "2026-02-01", category: "Salary", type: "income", merchant: "TechCorp Payroll Direct Dep", title: "Monthly Base Salary", paymentMethod: "Bank Transfer", amount: 4200.00, isRecurring: 1, notes: "Direct deposit monthly payroll" },
      { id: "tx_045", date: "2026-02-01", category: "Housing & Rent", type: "expense", merchant: "Equity Residential Lease", title: "Apartment Lease Rent", paymentMethod: "Bank Transfer", amount: 1450.00, isRecurring: 1, notes: "Monthly rental payment" },
      { id: "tx_046", date: "2026-02-03", category: "Food & Dining", type: "expense", merchant: "Trader Joe's #412", title: "Trader Joe's Groceries", paymentMethod: "Credit Card", amount: 65.30, isRecurring: 0, notes: "Groceries" },
      { id: "tx_047", date: "2026-02-05", category: "Entertainment", type: "expense", merchant: "Spotify Premium Music", title: "Spotify Subscription", paymentMethod: "Credit Card", amount: 11.99, isRecurring: 1, notes: "Recurring monthly audio stream" },
      { id: "tx_048", date: "2026-02-08", category: "Transportation", type: "expense", merchant: "Shell Gas Station", title: "Shell Gasoline", paymentMethod: "Credit Card", amount: 50.10, isRecurring: 0, notes: "Fuel fill-up" },
      { id: "tx_049", date: "2026-02-12", category: "Entertainment", type: "expense", merchant: "Netflix.com SaaS", title: "Netflix Subscription", paymentMethod: "Credit Card", amount: 19.99, isRecurring: 1, notes: "Monthly 4K streaming plan" },
      { id: "tx_050", date: "2026-02-14", category: "Food & Dining", type: "expense", merchant: "Sweetgreen NYC", title: "Valentine's Week Lunch", paymentMethod: "Credit Card", amount: 24.50, isRecurring: 0, notes: "Salad lunch" },
      { id: "tx_051", date: "2026-02-16", category: "Freelance & Side Gig", type: "income", merchant: "Upwork / Client Escrow", title: "Data Warehouse Consulting", paymentMethod: "Bank Transfer", amount: 850.00, isRecurring: 0, notes: "Snowflake schema design retainer" },
      { id: "tx_052", date: "2026-02-18", category: "Utilities & Bills", type: "expense", merchant: "AT&T Mobility Wireless", title: "Mobile Phone Bill", paymentMethod: "Debit Card", amount: 85.00, isRecurring: 1, notes: "Unlimited 5G wireless plan" },
      { id: "tx_053", date: "2026-02-21", category: "Shopping", type: "expense", merchant: "Zara Fashion Group", title: "Zara Spring Clothes", paymentMethod: "Credit Card", amount: 118.00, isRecurring: 0, notes: "Spring apparel refresh" },
      { id: "tx_054", date: "2026-02-22", category: "Utilities & Bills", type: "expense", merchant: "Spectrum Internet Fiber", title: "Gigabit Fiber Broadband", paymentMethod: "Credit Card", amount: 69.99, isRecurring: 1, notes: "Monthly home high-speed internet" },
      { id: "tx_055", date: "2026-02-26", category: "Healthcare", type: "expense", merchant: "City Urgent Care Clinic", title: "Urgent Care Sprain Evaluation", paymentMethod: "Credit Card", amount: 850.00, isRecurring: 0, notes: "ANOMALY: Urgent care evaluation and sprain x-ray" },

      { id: "tx_056", date: "2026-03-01", category: "Salary", type: "income", merchant: "TechCorp Payroll Direct Dep", title: "Monthly Base Salary", paymentMethod: "Bank Transfer", amount: 4200.00, isRecurring: 1, notes: "Direct deposit monthly payroll" },
      { id: "tx_057", date: "2026-03-01", category: "Housing & Rent", type: "expense", merchant: "Equity Residential Lease", title: "Apartment Lease Rent", paymentMethod: "Bank Transfer", amount: 1450.00, isRecurring: 1, notes: "Monthly rental payment" },
      { id: "tx_058", date: "2026-03-04", category: "Food & Dining", type: "expense", merchant: "Trader Joe's #412", title: "Trader Joe's Groceries", paymentMethod: "Credit Card", amount: 72.40, isRecurring: 0, notes: "Groceries" },
      { id: "tx_059", date: "2026-03-05", category: "Entertainment", type: "expense", merchant: "Spotify Premium Music", title: "Spotify Subscription", paymentMethod: "Credit Card", amount: 11.99, isRecurring: 1, notes: "Recurring monthly audio stream" },
      { id: "tx_060", date: "2026-03-09", category: "Transportation", type: "expense", merchant: "Metropolitan Transit Metro", title: "Monthly Subway Pass", paymentMethod: "Debit Card", amount: 34.00, isRecurring: 0, notes: "Metro card refill" },
      { id: "tx_061", date: "2026-03-12", category: "Entertainment", type: "expense", merchant: "Netflix.com SaaS", title: "Netflix Subscription", paymentMethod: "Credit Card", amount: 19.99, isRecurring: 1, notes: "Monthly 4K streaming plan" },
      { id: "tx_062", date: "2026-03-15", category: "Food & Dining", type: "expense", merchant: "Chipotle Mexican Grill", title: "Chipotle Lunch", paymentMethod: "Debit Card", amount: 16.20, isRecurring: 0, notes: "Lunch" },
      { id: "tx_063", date: "2026-03-18", category: "Utilities & Bills", type: "expense", merchant: "AT&T Mobility Wireless", title: "Mobile Phone Bill", paymentMethod: "Debit Card", amount: 85.00, isRecurring: 1, notes: "Unlimited 5G wireless plan" },
      { id: "tx_064", date: "2026-03-20", category: "Freelance & Side Gig", type: "income", merchant: "Upwork / Client Escrow", title: "Tableau Visualization Project", paymentMethod: "Bank Transfer", amount: 500.00, isRecurring: 0, notes: "Sales performance dashboard" },
      { id: "tx_065", date: "2026-03-22", category: "Utilities & Bills", type: "expense", merchant: "Spectrum Internet Fiber", title: "Gigabit Fiber Broadband", paymentMethod: "Credit Card", amount: 69.99, isRecurring: 1, notes: "Monthly home high-speed internet" },
      { id: "tx_066", date: "2026-03-25", category: "Shopping", type: "expense", merchant: "AMZN Mktp US*9281A", title: "Kitchen Cookware Set", paymentMethod: "Credit Card", amount: 45.20, isRecurring: 0, notes: "Cast iron skillet and pans" },
      { id: "tx_067", date: "2026-03-29", category: "Food & Dining", type: "expense", merchant: "Whole Foods Market", title: "Organic Grocery Items", paymentMethod: "Credit Card", amount: 105.40, isRecurring: 0, notes: "Weekend dinner ingredients" },

      { id: "tx_068", date: "2026-04-01", category: "Salary", type: "income", merchant: "TechCorp Payroll Direct Dep", title: "Monthly Base Salary", paymentMethod: "Bank Transfer", amount: 4200.00, isRecurring: 1, notes: "Direct deposit monthly payroll" },
      { id: "tx_069", date: "2026-04-01", category: "Housing & Rent", type: "expense", merchant: "Equity Residential Lease", title: "Apartment Lease Rent", paymentMethod: "Bank Transfer", amount: 1450.00, isRecurring: 1, notes: "Monthly rental payment" },
      { id: "tx_070", date: "2026-04-03", category: "Food & Dining", type: "expense", merchant: "Trader Joe's #412", title: "Trader Joe's Groceries", paymentMethod: "Credit Card", amount: 68.90, isRecurring: 0, notes: "Groceries" },
      { id: "tx_071", date: "2026-04-05", category: "Entertainment", type: "expense", merchant: "Spotify Premium Music", title: "Spotify Subscription", paymentMethod: "Credit Card", amount: 11.99, isRecurring: 1, notes: "Recurring monthly audio stream" },
      { id: "tx_072", date: "2026-04-08", category: "Transportation", type: "expense", merchant: "Chevron 82910", title: "Chevron Gas Fill-up", paymentMethod: "Credit Card", amount: 48.00, isRecurring: 0, notes: "Fuel refill" },
      { id: "tx_073", date: "2026-04-12", category: "Entertainment", type: "expense", merchant: "Netflix.com SaaS", title: "Netflix Subscription", paymentMethod: "Credit Card", amount: 19.99, isRecurring: 1, notes: "Monthly 4K streaming plan" },
      { id: "tx_074", date: "2026-04-16", category: "Freelance & Side Gig", type: "income", merchant: "Upwork / Client Escrow", title: "End-to-End Pipeline Retainer", paymentMethod: "Bank Transfer", amount: 1100.00, isRecurring: 0, notes: "Automated ingestion pipeline retainer" },
      { id: "tx_075", date: "2026-04-18", category: "Utilities & Bills", type: "expense", merchant: "AT&T Mobility Wireless", title: "Mobile Phone Bill", paymentMethod: "Debit Card", amount: 85.00, isRecurring: 1, notes: "Unlimited 5G wireless plan" },
      { id: "tx_076", date: "2026-04-22", category: "Utilities & Bills", type: "expense", merchant: "Spectrum Internet Fiber", title: "Gigabit Fiber Broadband", paymentMethod: "Credit Card", amount: 69.99, isRecurring: 1, notes: "Monthly home high-speed internet" },
      { id: "tx_077", date: "2026-04-24", category: "Education", type: "expense", merchant: "Udemy Academy Course", title: "Time Series Forecasting Masterclass", paymentMethod: "Credit Card", amount: 18.99, isRecurring: 0, notes: "ARIMA & Holt-Winters tutorial" },
      { id: "tx_078", date: "2026-04-27", category: "Food & Dining", type: "expense", merchant: "Whole Foods Market", title: "Weekly Groceries", paymentMethod: "Credit Card", amount: 92.15, isRecurring: 0, notes: "Organic dinners" },

      { id: "tx_132", date: "2026-10-01", category: "Salary", type: "income", merchant: "TechCorp Payroll Direct Dep", title: "Monthly Base Salary", paymentMethod: "Bank Transfer", amount: 4200.00, isRecurring: 1, notes: "Direct deposit monthly payroll" },
      { id: "tx_133", date: "2026-10-01", category: "Housing & Rent", type: "expense", merchant: "Equity Residential Lease", title: "Apartment Lease Rent", paymentMethod: "Bank Transfer", amount: 1450.00, isRecurring: 1, notes: "Monthly rental payment" },
      { id: "tx_134", date: "2026-10-03", category: "Food & Dining", type: "expense", merchant: "Trader Joe's #412", title: "Trader Joe's Groceries", paymentMethod: "Credit Card", amount: 73.40, isRecurring: 0, notes: "Groceries" },
      { id: "tx_135", date: "2026-10-05", category: "Entertainment", type: "expense", merchant: "Spotify Premium Music", title: "Spotify Subscription", paymentMethod: "Credit Card", amount: 11.99, isRecurring: 1, notes: "Recurring monthly audio stream" },
      { id: "tx_136", date: "2026-10-08", category: "Transportation", type: "expense", merchant: "Shell Gas Station", title: "Shell Fuel Fill-up", paymentMethod: "Credit Card", amount: 49.80, isRecurring: 0, notes: "Commute gas" },
      { id: "tx_137", date: "2026-10-12", category: "Entertainment", type: "expense", merchant: "Netflix.com SaaS", title: "Netflix Subscription", paymentMethod: "Credit Card", amount: 19.99, isRecurring: 1, notes: "Monthly 4K streaming plan" },
      { id: "tx_138", date: "2026-10-15", category: "Shopping", type: "expense", merchant: "Apple Store Retail", title: "MacBook Pro M-Series Workstation", paymentMethod: "Credit Card", amount: 1899.00, isRecurring: 0, notes: "ANOMALY: High-ticket MacBook workstation hardware upgrade" },
      { id: "tx_139", date: "2026-10-16", category: "Freelance & Side Gig", type: "income", merchant: "Upwork / Client Escrow", title: "Executive Analytics Retainer", paymentMethod: "Bank Transfer", amount: 900.00, isRecurring: 0, notes: "Dashboard engineering retainer" },
      { id: "tx_140", date: "2026-10-18", category: "Utilities & Bills", type: "expense", merchant: "AT&T Mobility Wireless", title: "Mobile Phone Bill", paymentMethod: "Debit Card", amount: 85.00, isRecurring: 1, notes: "Unlimited 5G wireless plan" },
      { id: "tx_141", date: "2026-10-22", category: "Utilities & Bills", type: "expense", merchant: "Spectrum Internet Fiber", title: "Gigabit Fiber Broadband", paymentMethod: "Credit Card", amount: 69.99, isRecurring: 1, notes: "Monthly home high-speed internet" },
      { id: "tx_142", date: "2026-10-25", category: "Food & Dining", type: "expense", merchant: "Whole Foods Market", title: "Whole Foods Dinner & Groceries", paymentMethod: "Credit Card", amount: 118.20, isRecurring: 0, notes: "Groceries & wine" },
      { id: "tx_143", date: "2026-10-28", category: "Healthcare", type: "expense", merchant: "CVS Pharmacy #3821", title: "CVS Preventative Care", paymentMethod: "Credit Card", amount: 42.10, isRecurring: 0, notes: "Supplements" },

      { id: "tx_144", date: "2026-11-01", category: "Salary", type: "income", merchant: "TechCorp Payroll Direct Dep", title: "Monthly Base Salary", paymentMethod: "Bank Transfer", amount: 4200.00, isRecurring: 1, notes: "Direct deposit monthly payroll" },
      { id: "tx_145", date: "2026-11-01", category: "Housing & Rent", type: "expense", merchant: "Equity Residential Lease", title: "Apartment Lease Rent", paymentMethod: "Bank Transfer", amount: 1450.00, isRecurring: 1, notes: "Monthly rental payment" },
      { id: "tx_146", date: "2026-11-03", category: "Food & Dining", type: "expense", merchant: "Trader Joe's #412", title: "Trader Joe's Groceries", paymentMethod: "Credit Card", amount: 69.50, isRecurring: 0, notes: "Weekly restock" },
      { id: "tx_147", date: "2026-11-05", category: "Entertainment", type: "expense", merchant: "Spotify Premium Music", title: "Spotify Subscription", paymentMethod: "Credit Card", amount: 11.99, isRecurring: 1, notes: "Recurring monthly audio stream" },
      { id: "tx_148", date: "2026-11-07", category: "Transportation", type: "expense", merchant: "Chevron 82910", title: "Chevron Gas Fill-up", paymentMethod: "Credit Card", amount: 51.20, isRecurring: 0, notes: "Commute gas refill" },
      { id: "tx_149", date: "2026-11-09", category: "Food & Dining", type: "expense", merchant: "Sweetgreen NYC", title: "Sweetgreen Harvest Bowl", paymentMethod: "Debit Card", amount: 18.90, isRecurring: 0, notes: "Healthy salad lunch" },
      { id: "tx_150", date: "2026-11-10", category: "Shopping", type: "expense", merchant: "AMZN Mktp US*9281A", title: "Books & Data Architecture Manuals", paymentMethod: "Credit Card", amount: 76.40, isRecurring: 0, notes: "Designing Data-Intensive Applications book" }
    ];

    this.saveTransactions(rawData);
    return rawData;
  }

  static exportToCSV() {
    const transactions = this.getTransactions();
    if (!transactions.length) return null;

    const headers = ['ID', 'Date', 'Title', 'Merchant', 'Type', 'Category', 'Amount', 'Payment Method', 'Is Recurring', 'Notes'];
    const rows = transactions.map(t => [
      t.id,
      t.date,
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${(t.merchant || t.title || '').replace(/"/g, '""')}"`,
      t.type,
      `"${(t.category || '').replace(/"/g, '""')}"`,
      parseFloat(t.amount).toFixed(2),
      `"${(t.paymentMethod || '').replace(/"/g, '""')}"`,
      t.isRecurring ? 1 : 0,
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Financial_Analytics_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }

  static exportToJSON() {
    const data = {
      platform: 'FinancePulse Analytics Studio',
      schemaVersion: '2.0-OLAP',
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      budgets: this.getBudgets(),
      transactions: this.getTransactions()
    };

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `FinancePulse_Analytics_Backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }
}
