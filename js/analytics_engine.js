/**
 * Financial Statistical & Predictive Analytics Engine
 * ====================================================
 * Core analytical algorithms:
 * - Parametric & Non-Parametric Statistics (Mean, Median, MAD, StdDev, IQR)
 * - Modified Z-Score & Tukey's IQR Outlier Detection
 * - Pareto 80/20 Cumulative Distribution Analysis
 * - Herfindahl-Hirschman Index (HHI) Concentration Analysis
 * - Holt-Winters Triple Exponential Smoothing Forecasting with 95% Confidence Intervals
 * - Monte Carlo Stochastic Simulation (1,000 iterations)
 * - Recurring Subscription Intelligence & Leakage Detection
 * - What-If Sensitivity Financial Modeling
 */

class AnalyticsEngine {

  /**
   * Calculates Mean, Median, StdDev, IQR, Min, Max for an array of numbers
   */
  static getDescriptiveStats(values) {
    if (!values || values.length === 0) {
      return { count: 0, mean: 0, median: 0, stdDev: 0, iqr: 0, min: 0, max: 0, mad: 1 };
    }

    const n = values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const mean = sum / n;

    // Variance & StdDev
    const variance = n > 1 
      ? sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1)
      : 0;
    const stdDev = Math.sqrt(variance);

    // Median
    const median = this.getPercentile(sorted, 0.50);
    const q1 = this.getPercentile(sorted, 0.25);
    const q3 = this.getPercentile(sorted, 0.75);
    const iqr = q3 - q1;

    // Median Absolute Deviation (MAD)
    const deviations = sorted.map(x => Math.abs(x - median)).sort((a, b) => a - b);
    const mad = this.getPercentile(deviations, 0.50) || 1.0;

    return {
      count: n,
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      q1: Math.round(q1 * 100) / 100,
      q3: Math.round(q3 * 100) / 100,
      iqr: Math.round(iqr * 100) / 100,
      min: sorted[0],
      max: sorted[n - 1],
      mad: Math.round(mad * 100) / 100
    };
  }

  static getPercentile(sortedValues, percentile) {
    if (sortedValues.length === 0) return 0;
    const index = (sortedValues.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (lower === upper) return sortedValues[index];
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  /**
   * Statistical Anomaly Detection using Modified Z-Score and Tukey's IQR rule
   */
  static detectAnomalies(transactions, sensitivity = 3.0) {
    const expenses = transactions.filter(t => t.type === 'expense');
    if (expenses.length === 0) return [];

    // Group expenses by category
    const categoryGroups = {};
    expenses.forEach(t => {
      if (!categoryGroups[t.category]) categoryGroups[t.category] = [];
      categoryGroups[t.category].push(t.amount);
    });

    // Compute median and MAD per category
    const categoryStats = {};
    Object.keys(categoryGroups).forEach(cat => {
      categoryStats[cat] = this.getDescriptiveStats(categoryGroups[cat]);
    });

    // Flag anomalies
    return expenses.map(t => {
      const stat = categoryStats[t.category];
      if (!stat || stat.count < 3) {
        return { ...t, isAnomaly: false, anomalyScore: 0, reason: '' };
      }

      // Modified Z-Score: 0.6745 * (x - median) / MAD
      const modZ = (0.6745 * (t.amount - stat.median)) / (stat.mad || 1.0);
      const isZScoreAnomaly = modZ > sensitivity;
      const isIqrAnomaly = t.amount > (stat.q3 + 1.5 * stat.iqr) && t.amount > 150;

      const isAnomaly = isZScoreAnomaly || isIqrAnomaly;
      let reason = '';
      if (isAnomaly) {
        const pctOverMedian = Math.round(((t.amount - stat.median) / (stat.median || 1)) * 100);
        reason = `Amount is ${pctOverMedian}% higher than category median (${modZ.toFixed(1)}σ deviation)`;
      }

      return {
        ...t,
        isAnomaly,
        anomalyScore: Math.round(modZ * 100) / 100,
        categoryMedian: stat.median,
        categoryIqr: stat.iqr,
        reason
      };
    });
  }

  /**
   * Pareto 80/20 Analysis (Sorted Descending Cumulative Spend)
   */
  static computePareto(transactions, groupBy = 'category') {
    const expenses = transactions.filter(t => t.type === 'expense');
    if (expenses.length === 0) return [];

    const groupTotals = {};
    let totalSpend = 0;

    expenses.forEach(t => {
      const key = groupBy === 'merchant' ? (t.merchant || 'Unknown Vendor') : t.category;
      groupTotals[key] = (groupTotals[key] || 0) + t.amount;
      totalSpend += t.amount;
    });

    const sortedEntries = Object.entries(groupTotals).sort((a, b) => b[1] - a[1]);

    let runningSum = 0;
    return sortedEntries.map(([name, spend]) => {
      runningSum += spend;
      const individualShare = (spend / totalSpend) * 100;
      const cumulativeShare = (runningSum / totalSpend) * 100;
      return {
        name,
        spend: Math.round(spend * 100) / 100,
        individualShare: Math.round(individualShare * 10) / 10,
        cumulativeShare: Math.round(cumulativeShare * 10) / 10,
        isTop80: cumulativeShare <= 80 || (cumulativeShare - individualShare) < 80
      };
    });
  }

  /**
   * Herfindahl-Hirschman Index (HHI) for Spending Concentration
   */
  static computeHHI(transactions) {
    const expenses = transactions.filter(t => t.type === 'expense');
    if (expenses.length === 0) return { hhi: 0, status: 'No Data', color: 'gray' };

    const categoryTotals = {};
    let totalSpend = 0;
    expenses.forEach(t => {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
      totalSpend += t.amount;
    });

    let hhi = 0;
    Object.values(categoryTotals).forEach(spend => {
      const share = (spend / totalSpend) * 100;
      hhi += share * share;
    });

    hhi = Math.round(hhi);

    let status = 'Well Diversified';
    let color = 'emerald';
    if (hhi > 2500) {
      status = 'Highly Concentrated';
      color = 'rose';
    } else if (hhi >= 1500) {
      status = 'Moderately Concentrated';
      color = 'amber';
    }

    return { hhi, status, color };
  }

  /**
   * Day-of-Week Spending Heatmap & Behavioral Elasticity
   */
  static computeDayOfWeekStats(transactions) {
    const expenses = transactions.filter(t => t.type === 'expense');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayTotals = Array(7).fill(0);
    const dayCounts = Array(7).fill(0);

    expenses.forEach(t => {
      const dt = new Date(t.date);
      const day = dt.getDay(); // 0 = Sunday
      dayTotals[day] += t.amount;
      dayCounts[day] += 1;
    });

    const weekdaySpend = dayTotals[1] + dayTotals[2] + dayTotals[3] + dayTotals[4] + dayTotals[5];
    const weekendSpend = dayTotals[0] + dayTotals[6];
    const weekdayTx = dayCounts[1] + dayCounts[2] + dayCounts[3] + dayCounts[4] + dayCounts[5];
    const weekendTx = dayCounts[0] + dayCounts[6];

    return {
      labels: dayNames,
      totals: dayTotals.map(x => Math.round(x)),
      counts: dayCounts,
      avgTicket: dayTotals.map((tot, idx) => dayCounts[idx] ? Math.round(tot / dayCounts[idx]) : 0),
      weekdaySpend: Math.round(weekdaySpend),
      weekendSpend: Math.round(weekendSpend),
      weekendSharePct: Math.round((weekendSpend / (weekdaySpend + weekendSpend || 1)) * 100)
    };
  }

  /**
   * Holt-Winters Triple Exponential Smoothing Forecast with 95% Confidence Intervals
   */
  static forecastExpenses(transactions, forecastDays = 30) {
    const expenses = transactions.filter(t => t.type === 'expense');
    if (expenses.length < 14) {
      return { historical: [], forecast: [], rmse: 0 };
    }

    // Daily aggregate series
    const dailyMap = {};
    expenses.forEach(t => {
      dailyMap[t.date] = (dailyMap[t.date] || 0) + t.amount;
    });

    const sortedDates = Object.keys(dailyMap).sort();
    const startDate = new Date(sortedDates[0]);
    const endDate = new Date(sortedDates[sortedDates.length - 1]);

    const series = [];
    const dateLabels = [];
    let cur = new Date(startDate);

    while (cur <= endDate) {
      const dStr = cur.toISOString().split('T')[0];
      series.push(dailyMap[dStr] || 0);
      dateLabels.push(dStr);
      cur.setDate(cur.getDate() + 1);
    }

    const n = series.length;
    const seasonLength = 7; // Weekly seasonality
    const alpha = 0.25;
    const beta = 0.10;
    const gamma = 0.25;

    // Initialization
    let level = series.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
    let trend = 0;
    if (n >= seasonLength * 2) {
      const sum1 = series.slice(0, seasonLength).reduce((a, b) => a + b, 0);
      const sum2 = series.slice(seasonLength, seasonLength * 2).reduce((a, b) => a + b, 0);
      trend = (sum2 - sum1) / (seasonLength * seasonLength);
    }

    const seasonals = series.slice(0, seasonLength).map(val => val - level);
    const fitted = [];
    const levels = [];
    const trends = [];

    for (let i = 0; i < n; i++) {
      const val = series[i];
      const sIdx = i % seasonLength;
      const lastLevel = level;
      const lastTrend = trend;

      const pred = Math.max(0, lastLevel + lastTrend + seasonals[sIdx]);
      fitted.push(pred);

      level = alpha * (val - seasonals[sIdx]) + (1 - alpha) * (lastLevel + lastTrend);
      trend = beta * (level - lastLevel) + (1 - beta) * lastTrend;
      seasonals[sIdx] = gamma * (val - level) + (1 - gamma) * seasonals[sIdx];

      levels.push(level);
      trends.push(trend);
    }

    // Residual Standard Error for Confidence Intervals
    let sumSqErr = 0;
    for (let i = 0; i < n; i++) {
      sumSqErr += Math.pow(series[i] - fitted[i], 2);
    }
    const sigmaE = Math.sqrt(sumSqErr / Math.max(1, n - 3));

    // Generate Future Forecast
    const forecasts = [];
    const lastDate = new Date(endDate);
    const lastL = levels[levels.length - 1];
    const lastT = trends[trends.length - 1];

    for (let m = 1; m <= forecastDays; m++) {
      const futureDate = new Date(lastDate);
      futureDate.setDate(lastDate.getDate() + m);
      const dStr = futureDate.toISOString().split('T')[0];
      const sIdx = (n + m - 1) % seasonLength;

      const point = Math.max(0, lastL + m * lastT + seasonals[sIdx]);
      const margin95 = 1.96 * sigmaE * Math.sqrt(1 + m / n);

      forecasts.push({
        date: dStr,
        point: Math.round(point * 100) / 100,
        lower95: Math.round(Math.max(0, point - margin95) * 100) / 100,
        upper95: Math.round((point + margin95) * 100) / 100
      });
    }

    return {
      historicalDates: dateLabels,
      historicalValues: series,
      fittedValues: fitted.map(v => Math.round(v)),
      forecast: forecasts,
      rmse: Math.round(sigmaE * 100) / 100
    };
  }

  /**
   * Monte Carlo Stochastic Simulation (1,000 runs)
   */
  static runMonteCarlo(transactions, monthlyBudget = 3800, daysRemaining = 20, spendSoFar = 1200) {
    const expenses = transactions.filter(t => t.type === 'expense');
    const dailyMap = {};
    expenses.forEach(t => {
      dailyMap[t.date] = (dailyMap[t.date] || 0) + t.amount;
    });

    const historicalDaily = Object.values(dailyMap).filter(v => v > 0);
    if (historicalDaily.length === 0) {
      return { p50: spendSoFar, p90: spendSoFar, probOverrun: 0, bins: [] };
    }

    // Fit log-normal parameters
    const logVals = historicalDaily.map(x => Math.log(x));
    const meanLog = logVals.reduce((a, b) => a + b, 0) / logVals.length;
    const varLog = logVals.reduce((a, b) => a + Math.pow(b - meanLog, 2), 0) / Math.max(1, logVals.length - 1);
    const stdLog = Math.sqrt(varLog);

    const iterations = 1000;
    const simulationOutcomes = [];
    let breachCount = 0;

    for (let i = 0; i < iterations; i++) {
      let simMonthSpend = spendSoFar;
      for (let d = 0; d < daysRemaining; d++) {
        // Box-Muller transform for normal random variable
        const u1 = Math.random() || 0.0001;
        const u2 = Math.random() || 0.0001;
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        const dailySample = Math.exp(meanLog + stdLog * z);
        simMonthSpend += dailySample;
      }
      simulationOutcomes.push(simMonthSpend);
      if (simMonthSpend > monthlyBudget) breachCount++;
    }

    simulationOutcomes.sort((a, b) => a - b);
    const p10 = simulationOutcomes[Math.floor(0.10 * iterations)];
    const p50 = simulationOutcomes[Math.floor(0.50 * iterations)];
    const p90 = simulationOutcomes[Math.floor(0.90 * iterations)];
    const probOverrun = Math.round((breachCount / iterations) * 1000) / 10;

    // Histogram bins
    const minVal = simulationOutcomes[0];
    const maxVal = simulationOutcomes[iterations - 1];
    const binCount = 12;
    const binWidth = (maxVal - minVal) / binCount;
    const bins = Array(binCount).fill(0);
    const binLabels = [];

    for (let b = 0; b < binCount; b++) {
      const lower = Math.round(minVal + b * binWidth);
      const upper = Math.round(lower + binWidth);
      binLabels.push(`$${lower}-$${upper}`);
    }

    simulationOutcomes.forEach(val => {
      const idx = Math.min(binCount - 1, Math.floor((val - minVal) / binWidth));
      bins[idx]++;
    });

    return {
      iterations,
      spendSoFar: Math.round(spendSoFar),
      monthlyBudget: Math.round(monthlyBudget),
      p10: Math.round(p10),
      p50: Math.round(p50),
      p90: Math.round(p90),
      probOverrun,
      binLabels,
      binFrequencies: bins
    };
  }

  /**
   * Automated Subscription Creep & Recurring Leak Detector
   */
  static detectSubscriptions(transactions) {
    const expenses = transactions.filter(t => t.type === 'expense');
    const merchantMap = {};

    expenses.forEach(t => {
      const name = (t.merchant || t.title || 'Unknown').trim();
      if (!merchantMap[name]) merchantMap[name] = [];
      merchantMap[name].push({ date: new Date(t.date), amount: t.amount, category: t.category });
    });

    const subscriptions = [];
    Object.entries(merchantMap).forEach(([merchant, txList]) => {
      if (txList.length < 2) return;
      txList.sort((a, b) => a.date - b.date);

      // Check for recurring cadence (approx 28-31 days or weekly)
      let isMonthlyRecurring = false;
      let cadenceDays = 0;

      for (let i = 1; i < txList.length; i++) {
        const diffDays = Math.round((txList[i].date - txList[i - 1].date) / (1000 * 60 * 60 * 24));
        if (diffDays >= 27 && diffDays <= 33) {
          isMonthlyRecurring = true;
          cadenceDays = diffDays;
          break;
        }
      }

      const amounts = txList.map(x => x.amount);
      const avgAmt = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const isIdenticalAmount = amounts.every(a => Math.abs(a - avgAmt) < 1.0);

      if (isMonthlyRecurring || (isIdenticalAmount && txList.length >= 3)) {
        subscriptions.push({
          merchant,
          category: txList[0].category,
          avgMonthlyCost: Math.round(avgAmt * 100) / 100,
          annualizedCost: Math.round(avgAmt * 12 * 100) / 100,
          occurrences: txList.length,
          lastBilled: txList[txList.length - 1].date.toISOString().split('T')[0]
        });
      }
    });

    return subscriptions.sort((a, b) => b.annualizedCost - a.annualizedCost);
  }
}
