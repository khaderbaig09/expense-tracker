/**
 * FinancePulse Financial Analytics & Intelligence Platform
 * =========================================================
 * Main Application Orchestrator & Controller
 */

class App {
  constructor() {
    this.settings = StorageService.getSettings();
    this.budgets = StorageService.getBudgets();
    this.transactions = StorageService.getTransactions();

    this.currentTab = 'executive';
    this.anomalySensitivity = 3.0;
    this.editingTxId = null;

    this.filters = {
      search: '',
      type: 'all',
      category: 'all'
    };

    this.pagination = {
      currentPage: 1,
      itemsPerPage: 10
    };

    this.whatIfParams = {
      diningCut: 0,
      shoppingCut: 0,
      inflation: 0
    };
  }

  init() {
    this.applyTheme(this.settings.theme || 'light');
    this.populateCurrencySelect();
    this.populateModalCategories();
    this.populateFilterCategories();
    this.setupSQLStudioPresets();
    this.setupEventListeners();

    // Initialize in-browser SQL database
    SQLStudio.initDatabase(this.transactions, this.budgets);

    // Initial render
    this.render();
  }

  getCurrencySymbol() {
    return (CURRENCIES[this.settings.currency] || CURRENCIES.USD).symbol;
  }

  formatMoney(amount) {
    const sym = this.getCurrencySymbol();
    return `${sym}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    const icon = document.getElementById('themeToggleIcon');
    if (icon) {
      icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
      if (window.lucide) lucide.createIcons();
    }
  }

  toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    this.settings.theme = newTheme;
    StorageService.saveSettings(this.settings);
    this.applyTheme(newTheme);
    this.renderActiveTabVisuals();
  }

  populateCurrencySelect() {
    const sel = document.getElementById('currencySelector');
    if (!sel) return;
    sel.value = this.settings.currency || 'USD';
  }

  populateModalCategories() {
    const sel = document.getElementById('modalTxCategory');
    if (!sel) return;
    const type = document.getElementById('modalTxType')?.value || 'expense';
    const cats = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    sel.innerHTML = cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  }

  populateFilterCategories() {
    const sel = document.getElementById('txCategoryFilter');
    if (!sel) return;
    const allCats = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
    sel.innerHTML = '<option value="all">All Categories</option>' + 
      allCats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  }

  setupSQLStudioPresets() {
    const sel = document.getElementById('sqlPresetSelector');
    if (!sel) return;
    sel.innerHTML = SQLStudio.PRESET_QUERIES.map(q => 
      `<option value="${q.id}">${q.name}</option>`
    ).join('');

    // Preload query 1
    const txtArea = document.getElementById('sqlQueryInput');
    if (txtArea && SQLStudio.PRESET_QUERIES.length > 0) {
      txtArea.value = SQLStudio.PRESET_QUERIES[0].sql;
    }
  }

  switchTab(tabId) {
    this.currentTab = tabId;
    document.querySelectorAll('.nav-tab').forEach(b => {
      if (b.dataset.tab === tabId) {
        b.className = 'nav-tab active inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm';
      } else {
        b.className = 'nav-tab inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium';
      }
    });

    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.add('hidden');
    });

    const activePane = document.getElementById(`tab-${tabId}`);
    if (activePane) activePane.classList.remove('hidden');

    this.renderActiveTabVisuals();
    if (window.lucide) lucide.createIcons();
  }

  render() {
    this.updateExecutiveKPIs();
    this.renderActiveTabVisuals();
    if (window.lucide) lucide.createIcons();
  }

  renderActiveTabVisuals() {
    const sym = this.getCurrencySymbol();

    if (this.currentTab === 'executive') {
      ChartManager.renderMonthlyTrend(this.transactions, sym);
      ChartManager.renderCategoryChart(this.transactions, sym);
      this.renderBudgetBars();
    } else if (this.currentTab === 'pareto') {
      const paretoData = AnalyticsEngine.computePareto(this.transactions, 'category');
      ChartManager.renderParetoChart(paretoData, sym);
      const dowData = AnalyticsEngine.computeDayOfWeekStats(this.transactions);
      ChartManager.renderDayOfWeekChart(dowData, sym);
      this.renderParetoTable(paretoData);
    } else if (this.currentTab === 'anomalies') {
      const scored = AnalyticsEngine.detectAnomalies(this.transactions, this.anomalySensitivity);
      ChartManager.renderAnomalyScatterPlot(scored, sym);
      this.renderAnomaliesList(scored);
      this.renderSubscriptionsList();
    } else if (this.currentTab === 'forecast') {
      const forecastResult = AnalyticsEngine.forecastExpenses(this.transactions, 30);
      ChartManager.renderForecastChart(forecastResult, sym);
      const rmseLabel = document.getElementById('forecastRmseLabel');
      if (rmseLabel) rmseLabel.textContent = `Model RMSE: ${sym}${forecastResult.rmse}`;

      const mcResult = AnalyticsEngine.runMonteCarlo(this.transactions, 3800, 20, 1450);
      ChartManager.renderMonteCarloChart(mcResult, sym);
      this.updateMonteCarloLabels(mcResult);
      this.updateWhatIfSensitivity();
    } else if (this.currentTab === 'sql') {
      this.runCurrentSQLQuery();
    } else if (this.currentTab === 'datawarehouse') {
      this.renderTransactionsTable();
    }
  }

  /**
   * Executive KPI Calculations
   */
  updateExecutiveKPIs() {
    const sym = this.getCurrencySymbol();
    let totalIncome = 0;
    let totalExpense = 0;
    const txDates = new Set();

    this.transactions.forEach(t => {
      txDates.add(t.date);
      if (t.type === 'income') totalIncome += t.amount;
      else totalExpense += t.amount;
    });

    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;
    const dayCount = Math.max(1, txDates.size);
    const dailyBurn = totalExpense / dayCount;

    // Runway calculation (assuming 6 months liquid reserves baseline)
    const liquidReserve = Math.max(15000, totalIncome * 0.4);
    const monthlyBurn = dailyBurn * 30.4;
    const runwayMonths = monthlyBurn > 0 ? (liquidReserve / monthlyBurn).toFixed(1) : '∞';

    // HHI Concentration
    const hhiResult = AnalyticsEngine.computeHHI(this.transactions);

    // Anomalies count
    const anomalies = AnalyticsEngine.detectAnomalies(this.transactions, this.anomalySensitivity).filter(t => t.isAnomaly);

    // Update DOM
    document.getElementById('kpiTotalIncome').textContent = `${sym}${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('kpiTotalExpense').textContent = `${sym}${totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('kpiTxCount').textContent = this.transactions.length;

    const kpiSavingsRateEl = document.getElementById('kpiSavingsRate');
    kpiSavingsRateEl.textContent = `${savingsRate.toFixed(1)}%`;
    kpiSavingsRateEl.className = `text-xl font-bold ${savingsRate >= 20 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`;

    document.getElementById('kpiNetSavings').textContent = `${this.formatMoney(netSavings)} net balance`;
    document.getElementById('kpiDailyBurn').textContent = `${sym}${Math.round(dailyBurn)}/day`;
    document.getElementById('kpiRunway').textContent = `Est. Runway: ~${runwayMonths} Months`;

    document.getElementById('kpiHhiScore').textContent = hhiResult.hhi;
    const hhiStatusEl = document.getElementById('kpiHhiStatus');
    hhiStatusEl.textContent = hhiResult.status;
    hhiStatusEl.className = `text-[11px] font-medium text-${hhiResult.color}-600 dark:text-${hhiResult.color}-400 mt-1`;

    const navBadge = document.getElementById('navAnomalyBadge');
    if (navBadge) navBadge.textContent = anomalies.length;
  }

  /**
   * Budget Utilization Grid
   */
  renderBudgetBars() {
    const container = document.getElementById('budgetBarsContainer');
    if (!container) return;
    const sym = this.getCurrencySymbol();

    const expenses = this.transactions.filter(t => t.type === 'expense');
    const categoryTotals = {};
    expenses.forEach(t => {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });

    const items = EXPENSE_CATEGORIES.map(cat => {
      const actual = categoryTotals[cat.name] || 0;
      const budget = this.budgets[cat.name] || 500;
      const pct = Math.round((actual / budget) * 100);

      let barColor = 'bg-indigo-600';
      let statusBadge = 'text-slate-500';
      if (pct > 100) {
        barColor = 'bg-rose-500';
        statusBadge = 'text-rose-600 font-bold';
      } else if (pct >= 85) {
        barColor = 'bg-amber-500';
        statusBadge = 'text-amber-600 font-semibold';
      }

      return `
        <div class="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3.5 border border-slate-100 dark:border-slate-800">
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-semibold text-xs text-slate-800 dark:text-slate-200">${cat.name}</span>
            <span class="text-xs ${statusBadge}">${pct}%</span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden mb-1.5">
            <div class="${barColor} h-full rounded-full transition-all duration-300" style="width: ${Math.min(pct, 100)}%"></div>
          </div>
          <div class="flex justify-between text-[11px] text-slate-500">
            <span>Spent: ${sym}${Math.round(actual)}</span>
            <span>Cap: ${sym}${budget}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = items.join('');
  }

  /**
   * Pareto Table Breakdown
   */
  renderParetoTable(paretoData) {
    const tbody = document.getElementById('paretoTableBody');
    if (!tbody) return;
    const sym = this.getCurrencySymbol();

    const vitalCategories = paretoData.filter(p => p.isTop80);
    const vitalSpend = vitalCategories.reduce((acc, p) => acc + p.spend, 0);

    const vitalCountEl = document.getElementById('paretoVitalCount');
    if (vitalCountEl) vitalCountEl.textContent = `${vitalCategories.length} Categories`;

    const vitalSpendEl = document.getElementById('paretoVitalSpend');
    if (vitalSpendEl) vitalSpendEl.textContent = `${sym}${vitalSpend.toLocaleString()}`;

    tbody.innerHTML = paretoData.map(p => `
      <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
        <td class="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200">${p.name}</td>
        <td class="px-3 py-2.5 font-mono">${sym}${p.spend.toLocaleString()}</td>
        <td class="px-3 py-2.5 font-mono">${p.individualShare}%</td>
        <td class="px-3 py-2.5 font-mono font-semibold">${p.cumulativeShare}%</td>
        <td class="px-3 py-2.5">
          ${p.isTop80 
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50">Vital Few (Top 80%)</span>' 
            : '<span class="px-2 py-0.5 rounded text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800">Useful Many</span>'}
        </td>
      </tr>
    `).join('');
  }

  /**
   * Statistical Anomalies List & Subscription List
   */
  renderAnomaliesList(scoredTransactions) {
    const container = document.getElementById('anomaliesListContainer');
    const badge = document.getElementById('flaggedCountBadge');
    if (!container) return;
    const sym = this.getCurrencySymbol();

    const anomalies = scoredTransactions.filter(t => t.isAnomaly);
    if (badge) badge.textContent = `${anomalies.length} Flagged`;

    if (anomalies.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-slate-400 text-xs">
          <i data-lucide="shield-check" class="w-8 h-8 mx-auto mb-2 text-emerald-500"></i>
          No transactions exceed the current ${this.anomalySensitivity}σ sensitivity threshold.
        </div>
      `;
      return;
    }

    container.innerHTML = anomalies.map(t => `
      <div class="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/60 flex items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-900 dark:text-white">${t.merchant || t.title}</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200">${t.anomalyScore}σ</span>
          </div>
          <div class="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
            ${t.reason}
          </div>
          <div class="text-[10px] text-slate-500 mt-1">
            ${t.date} • ${t.category} • ${t.notes || 'Routine entry'}
          </div>
        </div>
        <div class="font-bold text-rose-600 dark:text-rose-400 font-mono text-sm whitespace-nowrap">
          ${sym}${t.amount.toLocaleString()}
        </div>
      </div>
    `).join('');
  }

  renderSubscriptionsList() {
    const container = document.getElementById('subscriptionsListContainer');
    if (!container) return;
    const sym = this.getCurrencySymbol();

    const subs = AnalyticsEngine.detectSubscriptions(this.transactions);
    if (subs.length === 0) {
      container.innerHTML = '<div class="text-center py-8 text-slate-400 text-xs">No recurring subscriptions detected.</div>';
      return;
    }

    container.innerHTML = subs.map(s => `
      <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
        <div>
          <div class="font-semibold text-slate-900 dark:text-white">${s.merchant}</div>
          <div class="text-[11px] text-slate-500">
            ${s.category} • ${s.occurrences} billing events • Last: ${s.lastBilled}
          </div>
        </div>
        <div class="text-right">
          <div class="font-bold text-slate-800 dark:text-slate-200 font-mono text-xs">
            ${sym}${s.avgMonthlyCost}/mo
          </div>
          <div class="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold font-mono">
            ${sym}${s.annualizedCost}/yr
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Monte Carlo & What-If Simulation Updates
   */
  updateMonteCarloLabels(mcResult) {
    const sym = this.getCurrencySymbol();
    document.getElementById('mcOverrunProb').textContent = `Risk of Overrun: ${mcResult.probOverrun}%`;
    document.getElementById('mcP10').textContent = `${sym}${mcResult.p10}`;
    document.getElementById('mcP50').textContent = `${sym}${mcResult.p50}`;
    document.getElementById('mcP90').textContent = `${sym}${mcResult.p90}`;
  }

  updateWhatIfSensitivity() {
    const sym = this.getCurrencySymbol();
    const expenses = this.transactions.filter(t => t.type === 'expense');
    let diningSpend = 0;
    let shoppingSpend = 0;
    let totalSpend = 0;
    let totalIncome = 0;

    this.transactions.forEach(t => {
      if (t.type === 'income') totalIncome += t.amount;
      else {
        totalSpend += t.amount;
        if (t.category === 'Food & Dining') diningSpend += t.amount;
        if (['Shopping', 'Entertainment'].includes(t.category)) shoppingSpend += t.amount;
      }
    });

    const diningSaved = (diningSpend * (this.whatIfParams.diningCut / 100));
    const shoppingSaved = (shoppingSpend * (this.whatIfParams.shoppingCut / 100));
    const inflationAdded = (totalSpend * (this.whatIfParams.inflation / 100));

    const netAnnualShift = (diningSaved + shoppingSaved - inflationAdded);
    const revisedSpend = totalSpend - (diningSaved + shoppingSaved) + inflationAdded;
    const revisedSavingsRate = totalIncome > 0 ? ((totalIncome - revisedSpend) / totalIncome) * 100 : 0;

    const shiftEl = document.getElementById('simProjectedShift');
    if (shiftEl) {
      shiftEl.textContent = `${netAnnualShift >= 0 ? '+' : '-'}${sym}${Math.abs(Math.round(netAnnualShift))}/year`;
      shiftEl.className = `text-sm font-bold ${netAnnualShift >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`;
    }

    const rateEl = document.getElementById('simRevisedSavingsRate');
    if (rateEl) {
      rateEl.textContent = `${revisedSavingsRate.toFixed(1)}%`;
    }
  }

  /**
   * In-Browser SQL Studio Execution
   */
  runCurrentSQLQuery() {
    const input = document.getElementById('sqlQueryInput');
    const errorAlert = document.getElementById('sqlErrorAlert');
    const metricsLabel = document.getElementById('sqlExecutionMetrics');
    if (!input) return;

    const sql = input.value.trim();
    if (!sql) return;

    const result = SQLStudio.executeQuery(sql);

    if (!result.success) {
      if (errorAlert) {
        errorAlert.textContent = `SQL Error: ${result.error}`;
        errorAlert.classList.remove('hidden');
      }
      return;
    }

    if (errorAlert) errorAlert.classList.add('hidden');
    if (metricsLabel) {
      metricsLabel.textContent = `Latency: ${result.latencyMs}ms | Rows: ${result.rowCount}`;
    }

    this.renderSQLResultsTable(result.data);
  }

  renderSQLResultsTable(data) {
    const headerRow = document.getElementById('sqlResultsHeaderRow');
    const tbody = document.getElementById('sqlResultsBody');
    if (!headerRow || !tbody) return;

    if (!data || data.length === 0) {
      headerRow.innerHTML = '<th class="px-3 py-2">Result</th>';
      tbody.innerHTML = '<tr><td class="px-3 py-4 text-center text-slate-400">Query returned 0 rows.</td></tr>';
      return;
    }

    const cols = Object.keys(data[0]);
    headerRow.innerHTML = cols.map(c => `<th class="px-3 py-2 font-semibold">${c}</th>`).join('');

    tbody.innerHTML = data.slice(0, 100).map(row => `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
        ${cols.map(c => `<td class="px-3 py-2 whitespace-nowrap">${row[c] !== null && row[c] !== undefined ? row[c] : '<span class="text-slate-400">NULL</span>'}</td>`).join('')}
      </tr>
    `).join('');
  }

  /**
   * Data Warehouse Tab & Transactions Table
   */
  renderTransactionsTable() {
    const tbody = document.getElementById('transactionsTableBody');
    const info = document.getElementById('paginationInfo');
    const pageNum = document.getElementById('currentPageNum');
    if (!tbody) return;
    const sym = this.getCurrencySymbol();

    let list = [...this.transactions];

    // Search filter
    if (this.filters.search) {
      const q = this.filters.search.toLowerCase();
      list = list.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.merchant && t.merchant.toLowerCase().includes(q)) ||
        (t.notes && t.notes.toLowerCase().includes(q))
      );
    }

    // Type filter
    if (this.filters.type !== 'all') {
      list = list.filter(t => t.type === this.filters.type);
    }

    // Category filter
    if (this.filters.category !== 'all') {
      list = list.filter(t => t.category === this.filters.category);
    }

    const totalItems = list.length;
    const totalPages = Math.ceil(totalItems / this.pagination.itemsPerPage) || 1;
    this.pagination.currentPage = Math.min(this.pagination.currentPage, totalPages);

    const startIdx = (this.pagination.currentPage - 1) * this.pagination.itemsPerPage;
    const paginated = list.slice(startIdx, startIdx + this.pagination.itemsPerPage);

    if (info) info.textContent = `Showing ${Math.min(startIdx + 1, totalItems)} to ${Math.min(startIdx + this.pagination.itemsPerPage, totalItems)} of ${totalItems} records`;
    if (pageNum) pageNum.textContent = `${this.pagination.currentPage} / ${totalPages}`;

    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    if (prevBtn) prevBtn.disabled = this.pagination.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = this.pagination.currentPage >= totalPages;

    if (paginated.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">No transactions match current filters.</td></tr>';
      return;
    }

    tbody.innerHTML = paginated.map(t => {
      const isExpense = t.type === 'expense';
      const catObj = EXPENSE_CATEGORIES.find(c => c.name === t.category) || INCOME_CATEGORIES.find(c => c.name === t.category);
      const icon = catObj ? catObj.icon : 'tag';

      return `
        <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
          <td class="px-4 py-2.5 font-mono text-slate-500">${t.date}</td>
          <td class="px-4 py-2.5">
            <div class="font-semibold text-slate-900 dark:text-white">${t.merchant || t.title}</div>
            <div class="text-[11px] text-slate-400 truncate max-w-xs">${t.notes || t.title}</div>
          </td>
          <td class="px-4 py-2.5">
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <i data-lucide="${icon}" class="w-3 h-3 text-indigo-500"></i>
              ${t.category}
            </span>
          </td>
          <td class="px-4 py-2.5 text-slate-500">${t.paymentMethod || 'Credit Card'}</td>
          <td class="px-4 py-2.5 text-right font-mono font-bold ${isExpense ? 'text-slate-800 dark:text-slate-200' : 'text-emerald-600 dark:text-emerald-400'}">
            ${isExpense ? '-' : '+'}${sym}${parseFloat(t.amount).toFixed(2)}
          </td>
          <td class="px-4 py-2.5 text-center">
            ${t.isRecurring ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-semibold">Recurring</span>' : ''}
            ${t.isAnomaly ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-bold ml-1">Anomaly</span>' : ''}
          </td>
          <td class="px-4 py-2.5 text-right">
            <button class="delete-tx-btn p-1 text-slate-400 hover:text-rose-600 transition" data-id="${t.id}" title="Delete Record">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach delete listeners
    document.querySelectorAll('.delete-tx-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        if (confirm('Delete this transaction record?')) {
          StorageService.deleteTransaction(id);
          this.transactions = StorageService.getTransactions();
          SQLStudio.initDatabase(this.transactions, this.budgets);
          this.render();
        }
      });
    });

    if (window.lucide) lucide.createIcons();
  }

  /**
   * Executive Financial Briefing Generation
   */
  generateExecutiveBrief() {
    const sym = this.getCurrencySymbol();
    let totalIncome = 0;
    let totalExpense = 0;
    this.transactions.forEach(t => {
      if (t.type === 'income') totalIncome += t.amount;
      else totalExpense += t.amount;
    });

    const net = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;
    const pareto = AnalyticsEngine.computePareto(this.transactions, 'category');
    const vitalCategories = pareto.filter(p => p.isTop80);
    const hhi = AnalyticsEngine.computeHHI(this.transactions);
    const anomalies = AnalyticsEngine.detectAnomalies(this.transactions, this.anomalySensitivity).filter(t => t.isAnomaly);
    const subs = AnalyticsEngine.detectSubscriptions(this.transactions);
    const totalSubAnnual = subs.reduce((acc, s) => acc + s.annualizedCost, 0);

    const html = `
      <div class="space-y-4">
        <div class="border-b pb-3 border-slate-200 dark:border-slate-800">
          <div class="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 tracking-wider">Executive Intelligence Briefing</div>
          <h2 class="text-base font-bold text-slate-900 dark:text-white mt-0.5">Fiscal Health, Burn Rate & Risk Audit</h2>
          <div class="text-slate-500 text-[11px] mt-0.5">Generated: ${new Date().toLocaleDateString(undefined, { dateStyle: 'full' })}</div>
        </div>

        <div>
          <h4 class="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] mb-1.5">1. Key Performance Summary</h4>
          <ul class="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
            <li><strong>Aggregate Inflow:</strong> ${sym}${totalIncome.toLocaleString()} | <strong>Outflow:</strong> ${sym}${totalExpense.toLocaleString()}</li>
            <li><strong>Net Operating Balance:</strong> ${sym}${net.toLocaleString()} (${savingsRate.toFixed(1)}% Savings Margin)</li>
            <li><strong>Spending Concentration (HHI):</strong> ${hhi.hhi} — <em>${hhi.status}</em></li>
          </ul>
        </div>

        <div>
          <h4 class="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] mb-1.5">2. Pareto 80/20 Cost Drivers</h4>
          <p class="text-slate-600 dark:text-slate-300 mb-1.5">
            <strong>${vitalCategories.length} categories</strong> account for $\ge 80\%$ of all expenditures:
          </p>
          <div class="grid grid-cols-2 gap-2">
            ${vitalCategories.map(c => `
              <div class="p-2 rounded bg-slate-50 dark:bg-slate-800 font-mono text-[11px] flex justify-between">
                <span>${c.name}</span>
                <strong>${sym}${c.spend.toLocaleString()} (${c.individualShare}%)</strong>
              </div>
            `).join('')}
          </div>
        </div>

        <div>
          <h4 class="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] mb-1.5">3. Outlier & Subscription Leakage Audit</h4>
          <ul class="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
            <li><strong>Flagged Outliers:</strong> ${anomalies.length} transactions flagged exceeding ${this.anomalySensitivity}σ modified Z-Score.</li>
            <li><strong>Recurring Subscriptions:</strong> ${subs.length} active recurring vendors totaling <strong>${sym}${totalSubAnnual.toLocaleString()}/year</strong> in committed cashflow.</li>
          </ul>
        </div>

        <div class="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-900/60">
          <h4 class="font-bold text-indigo-900 dark:text-indigo-300 text-[11px] mb-1">Recommended Strategic Interventions:</h4>
          <p class="text-indigo-800 dark:text-indigo-200 text-[11px]">
            Target discretionary trimming in top Pareto tiers (${vitalCategories.slice(0, 2).map(c => c.name).join(', ')}). Audit annualized SaaS subscriptions to reduce recurring commitments by an estimated 15-20%.
          </p>
        </div>
      </div>
    `;

    const container = document.getElementById('executiveBriefContent');
    if (container) container.innerHTML = html;

    const modal = document.getElementById('executiveBriefModal');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }

  /**
   * Event Listeners Setup
   */
  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Theme toggle
    document.getElementById('themeToggleBtn')?.addEventListener('click', () => this.toggleTheme());

    // Currency selector
    document.getElementById('currencySelector')?.addEventListener('change', (e) => {
      this.settings.currency = e.target.value;
      StorageService.saveSettings(this.settings);
      this.render();
    });

    // Anomaly sensitivity slider
    const sensSlider = document.getElementById('anomalySensitivitySlider');
    const sensLabel = document.getElementById('sensitivityValueLabel');
    sensSlider?.addEventListener('input', (e) => {
      this.anomalySensitivity = parseFloat(e.target.value);
      if (sensLabel) sensLabel.textContent = `${this.anomalySensitivity.toFixed(1)}σ`;
      this.render();
    });

    // What-If Sliders
    const dSlider = document.getElementById('sliderDining');
    const sSlider = document.getElementById('sliderShopping');
    const iSlider = document.getElementById('sliderInflation');

    dSlider?.addEventListener('input', (e) => {
      this.whatIfParams.diningCut = parseFloat(e.target.value);
      document.getElementById('sliderDiningVal').textContent = `${this.whatIfParams.diningCut}%`;
      this.updateWhatIfSensitivity();
    });

    sSlider?.addEventListener('input', (e) => {
      this.whatIfParams.shoppingCut = parseFloat(e.target.value);
      document.getElementById('sliderShoppingVal').textContent = `${this.whatIfParams.shoppingCut}%`;
      this.updateWhatIfSensitivity();
    });

    iSlider?.addEventListener('input', (e) => {
      this.whatIfParams.inflation = parseFloat(e.target.value);
      document.getElementById('sliderInflationVal').textContent = `${this.whatIfParams.inflation}%`;
      this.updateWhatIfSensitivity();
    });

    // Monte Carlo Re-simulation button
    document.getElementById('runMonteCarloBtn')?.addEventListener('click', () => {
      const mcResult = AnalyticsEngine.runMonteCarlo(this.transactions, 3800, 20, 1450);
      ChartManager.renderMonteCarloChart(mcResult, this.getCurrencySymbol());
      this.updateMonteCarloLabels(mcResult);
    });

    // SQL Studio Preset change
    document.getElementById('sqlPresetSelector')?.addEventListener('change', (e) => {
      const q = SQLStudio.PRESET_QUERIES.find(x => x.id === e.target.value);
      if (q) {
        document.getElementById('sqlQueryInput').value = q.sql;
        this.runCurrentSQLQuery();
      }
    });

    // SQL Execute button
    document.getElementById('executeSqlBtn')?.addEventListener('click', () => this.runCurrentSQLQuery());

    // SQL Keydown (Ctrl + Enter)
    document.getElementById('sqlQueryInput')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.runCurrentSQLQuery();
      }
    });

    // Export SQL CSV
    document.getElementById('exportSqlCsvBtn')?.addEventListener('click', () => {
      SQLStudio.exportResultsToCSV();
    });

    // Data Warehouse Search & Filters
    document.getElementById('txSearchInput')?.addEventListener('input', (e) => {
      this.filters.search = e.target.value;
      this.pagination.currentPage = 1;
      this.renderTransactionsTable();
    });

    document.getElementById('txTypeFilter')?.addEventListener('change', (e) => {
      this.filters.type = e.target.value;
      this.pagination.currentPage = 1;
      this.renderTransactionsTable();
    });

    document.getElementById('txCategoryFilter')?.addEventListener('change', (e) => {
      this.filters.category = e.target.value;
      this.pagination.currentPage = 1;
      this.renderTransactionsTable();
    });

    // Pagination buttons
    document.getElementById('prevPageBtn')?.addEventListener('click', () => {
      if (this.pagination.currentPage > 1) {
        this.pagination.currentPage--;
        this.renderTransactionsTable();
      }
    });

    document.getElementById('nextPageBtn')?.addEventListener('click', () => {
      this.pagination.currentPage++;
      this.renderTransactionsTable();
    });

    // Export CSV / JSON buttons
    document.getElementById('exportCsvBtn')?.addEventListener('click', () => StorageService.exportToCSV());
    document.getElementById('exportJsonBtn')?.addEventListener('click', () => StorageService.exportToJSON());

    // Reload enterprise dataset button
    document.getElementById('reloadEnterpriseDataBtn')?.addEventListener('click', () => {
      if (confirm('Reload the 1-year realistic analytics dataset?')) {
        this.transactions = StorageService.loadRealisticEnterpriseDataset();
        SQLStudio.initDatabase(this.transactions, this.budgets);
        this.render();
      }
    });

    // Executive Brief button & modal
    document.getElementById('openExecutiveBriefBtn')?.addEventListener('click', () => this.generateExecutiveBrief());
    document.getElementById('closeExecutiveBriefBtn')?.addEventListener('click', () => {
      document.getElementById('executiveBriefModal').classList.add('hidden');
    });

    document.getElementById('printBriefBtn')?.addEventListener('click', () => window.print());
    document.getElementById('copyBriefBtn')?.addEventListener('click', () => {
      const text = document.getElementById('executiveBriefContent').innerText;
      navigator.clipboard.writeText(text);
      alert('Briefing copied to clipboard!');
    });

    // Add Transaction Modal
    document.getElementById('openAddTxBtn')?.addEventListener('click', () => {
      document.getElementById('modalTxDate').value = new Date().toISOString().split('T')[0];
      document.getElementById('txModal').classList.remove('hidden');
    });

    document.getElementById('closeTxModalBtn')?.addEventListener('click', () => {
      document.getElementById('txModal').classList.add('hidden');
    });

    document.getElementById('cancelTxModalBtn')?.addEventListener('click', () => {
      document.getElementById('txModal').classList.add('hidden');
    });

    document.getElementById('modalTxType')?.addEventListener('change', () => this.populateModalCategories());

    // Transaction Form Submit
    document.getElementById('txForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const type = document.getElementById('modalTxType').value;
      const amount = parseFloat(document.getElementById('modalTxAmount').value);
      const merchant = document.getElementById('modalTxMerchant').value;
      const category = document.getElementById('modalTxCategory').value;
      const date = document.getElementById('modalTxDate').value;
      const paymentMethod = document.getElementById('modalTxPaymentMethod').value;
      const notes = document.getElementById('modalTxNotes').value;
      const isRecurring = document.getElementById('modalTxRecurring').checked;

      StorageService.addTransaction({
        type,
        amount,
        merchant,
        title: merchant,
        category,
        date,
        paymentMethod,
        notes,
        isRecurring
      });

      this.transactions = StorageService.getTransactions();
      SQLStudio.initDatabase(this.transactions, this.budgets);
      document.getElementById('txModal').classList.add('hidden');
      e.target.reset();
      this.render();
    });
  }
}

// Instantiate application on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.financeApp = new App();
  window.financeApp.init();
});
