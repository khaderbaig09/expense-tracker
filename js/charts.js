/**
 * Chart Management Service for Financial Analytics Platform (Chart.js)
 * ====================================================================
 * Renders executive BI visualizations:
 * 1. Executive Cash Flow & Inflow vs. Outflow (Comparative Bar + Net Line)
 * 2. Category Expenditure Share (Doughnut)
 * 3. Pareto 80/20 Dual-Axis Analysis (Category Spend Bars + Cumulative % Curve)
 * 4. Day-of-Week Behavioral Elasticity (Bar Chart)
 * 5. Statistical Outlier & Anomaly Scatter Plot (Highlighting > 3.0σ in Red)
 * 6. Holt-Winters 30-Day Predictive Forecast with 95% Confidence Intervals
 * 7. Monte Carlo Simulation Histogram (Distribution & Risk of Overrun)
 */

class ChartManager {
  static instances = {};

  static isDarkMode() {
    return document.documentElement.classList.contains('dark');
  }

  static getThemeColors() {
    const isDark = this.isDarkMode();
    return {
      textColor: isDark ? '#94a3b8' : '#475569',
      gridColor: isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)',
      tooltipBg: isDark ? '#0f172a' : '#ffffff',
      tooltipText: isDark ? '#f8fafc' : '#0f172a',
      borderColor: isDark ? '#334155' : '#e2e8f0'
    };
  }

  static destroyChart(key) {
    if (this.instances[key]) {
      this.instances[key].destroy();
      this.instances[key] = null;
    }
  }

  /**
   * 1. Executive Monthly Trend (Inflow vs. Outflow Bar + Net Flow Line)
   */
  static renderMonthlyTrend(transactions, currencySymbol = '$') {
    const canvas = document.getElementById('monthlyTrendChart');
    if (!canvas) return;
    this.destroyChart('monthlyTrend');

    const theme = this.getThemeColors();
    const monthlyData = {};

    transactions.forEach(t => {
      const dt = new Date(t.date);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[key]) {
        monthlyData[key] = { income: 0, expense: 0, label: dt.toLocaleString('default', { month: 'short', year: '2-digit' }) };
      }
      if (t.type === 'income') monthlyData[key].income += t.amount;
      else monthlyData[key].expense += t.amount;
    });

    const sortedKeys = Object.keys(monthlyData).sort().slice(-8);
    const labels = sortedKeys.map(k => monthlyData[k].label);
    const incomeData = sortedKeys.map(k => Math.round(monthlyData[k].income));
    const expenseData = sortedKeys.map(k => Math.round(monthlyData[k].expense));
    const netData = sortedKeys.map(k => Math.round(monthlyData[k].income - monthlyData[k].expense));

    this.instances.monthlyTrend = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: 'Net Cash Flow',
            data: netData,
            borderColor: '#6366f1',
            backgroundColor: '#6366f1',
            borderWidth: 2.5,
            pointRadius: 4,
            tension: 0.25,
            yAxisID: 'y'
          },
          {
            type: 'bar',
            label: 'Income (Inflow)',
            data: incomeData,
            backgroundColor: 'rgba(16, 185, 129, 0.8)',
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            type: 'bar',
            label: 'Expenses (Outflow)',
            data: expenseData,
            backgroundColor: 'rgba(239, 68, 68, 0.75)',
            borderRadius: 6,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: theme.textColor, font: { family: 'inherit', size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${currencySymbol}${ctx.raw.toLocaleString()}`
            }
          }
        },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor } },
          y: {
            grid: { color: theme.gridColor },
            ticks: {
              color: theme.textColor,
              callback: (val) => `${currencySymbol}${val.toLocaleString()}`
            }
          }
        }
      }
    });
  }

  /**
   * 2. Category Share Doughnut
   */
  static renderCategoryChart(transactions, currencySymbol = '$') {
    const canvas = document.getElementById('categoryPieChart');
    if (!canvas) return;
    this.destroyChart('category');

    const theme = this.getThemeColors();
    const expenses = transactions.filter(t => t.type === 'expense');
    const categoryTotals = {};

    expenses.forEach(t => {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });

    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals).map(v => Math.round(v));
    const colors = labels.map(l => {
      const cat = EXPENSE_CATEGORIES.find(c => c.name === l);
      return cat ? cat.color : '#94a3b8';
    });

    this.instances.category = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: theme.tooltipBg
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'right', labels: { color: theme.textColor, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = Math.round((ctx.raw / total) * 100);
                return `${ctx.label}: ${currencySymbol}${ctx.raw.toLocaleString()} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  /**
   * 3. Pareto 80/20 Dual-Axis Chart (Spend Bar + Cumulative % Line)
   */
  static renderParetoChart(paretoData, currencySymbol = '$') {
    const canvas = document.getElementById('paretoChart');
    if (!canvas) return;
    this.destroyChart('pareto');

    const theme = this.getThemeColors();
    const labels = paretoData.map(p => p.name);
    const spendData = paretoData.map(p => p.spend);
    const cumulativeData = paretoData.map(p => p.cumulativeShare);

    this.instances.pareto = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: 'Cumulative Share %',
            data: cumulativeData,
            borderColor: '#ef4444',
            backgroundColor: '#ef4444',
            borderWidth: 2.5,
            pointRadius: 4,
            yAxisID: 'y1'
          },
          {
            type: 'bar',
            label: 'Total Spend',
            data: spendData,
            backgroundColor: paretoData.map(p => p.isTop80 ? 'rgba(79, 70, 229, 0.85)' : 'rgba(148, 163, 184, 0.6)'),
            borderRadius: 6,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: theme.textColor } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.yAxisID === 'y1') return `Cumulative: ${ctx.raw}%`;
                return `Spend: ${currencySymbol}${ctx.raw.toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, maxRotation: 40 } },
          y: {
            type: 'linear',
            position: 'left',
            grid: { color: theme.gridColor },
            ticks: { color: theme.textColor, callback: (v) => `${currencySymbol}${v}` }
          },
          y1: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 105,
            grid: { drawOnChartArea: false },
            ticks: { color: '#ef4444', callback: (v) => `${v}%` }
          }
        }
      }
    });
  }

  /**
   * 4. Day of Week Spending Behavior
   */
  static renderDayOfWeekChart(dowData, currencySymbol = '$') {
    const canvas = document.getElementById('dayOfWeekChart');
    if (!canvas) return;
    this.destroyChart('dayOfWeek');

    const theme = this.getThemeColors();

    this.instances.dayOfWeek = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: dowData.labels,
        datasets: [
          {
            label: 'Total Expenditure',
            data: dowData.totals,
            backgroundColor: [
              'rgba(244, 63, 94, 0.8)', // Sun
              'rgba(99, 102, 241, 0.7)',
              'rgba(99, 102, 241, 0.7)',
              'rgba(99, 102, 241, 0.7)',
              'rgba(99, 102, 241, 0.7)',
              'rgba(99, 102, 241, 0.85)', // Fri
              'rgba(244, 63, 94, 0.8)'  // Sat
            ],
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Total: ${currencySymbol}${ctx.raw.toLocaleString()} (Avg Ticket: ${currencySymbol}${dowData.avgTicket[ctx.dataIndex]})`
            }
          }
        },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor } },
          y: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => `${currencySymbol}${v}` } }
        }
      }
    });
  }

  /**
   * 5. Anomaly Detection Scatter Plot
   */
  static renderAnomalyScatterPlot(scoredTransactions, currencySymbol = '$') {
    const canvas = document.getElementById('anomalyScatterChart');
    if (!canvas) return;
    this.destroyChart('anomalyScatter');

    const theme = this.getThemeColors();
    const sorted = [...scoredTransactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    const normalPoints = [];
    const anomalyPoints = [];

    sorted.forEach((t, idx) => {
      const pt = {
        x: idx,
        y: t.amount,
        date: t.date,
        merchant: t.merchant || t.title,
        category: t.category,
        score: t.anomalyScore,
        reason: t.reason
      };
      if (t.isAnomaly) anomalyPoints.push(pt);
      else normalPoints.push(pt);
    });

    this.instances.anomalyScatter = new Chart(canvas.getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Standard Transactions',
            data: normalPoints,
            backgroundColor: 'rgba(99, 102, 241, 0.45)',
            borderColor: 'rgba(99, 102, 241, 0.8)',
            pointRadius: 4.5
          },
          {
            label: 'Statistical Anomalies (> 3.0σ)',
            data: anomalyPoints,
            backgroundColor: 'rgba(239, 68, 68, 0.95)',
            borderColor: '#b91c1c',
            borderWidth: 2,
            pointRadius: 9,
            pointHoverRadius: 11
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: theme.textColor } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const p = ctx.raw;
                return [
                  `${p.merchant} (${p.category})`,
                  `Amount: ${currencySymbol}${p.y.toLocaleString()} on ${p.date}`,
                  p.reason ? `🚨 ${p.reason}` : `Score: ${p.score}σ`
                ];
              }
            }
          }
        },
        scales: {
          x: { display: false },
          y: {
            grid: { color: theme.gridColor },
            ticks: { color: theme.textColor, callback: (v) => `${currencySymbol}${v}` }
          }
        }
      }
    });
  }

  /**
   * 6. Time-Series Predictive Forecast with 95% Confidence Interval Band
   */
  static renderForecastChart(forecastResult, currencySymbol = '$') {
    const canvas = document.getElementById('forecastChart');
    if (!canvas) return;
    this.destroyChart('forecast');

    const theme = this.getThemeColors();
    const histDates = forecastResult.historicalDates.slice(-30);
    const histValues = forecastResult.historicalValues.slice(-30);

    const futureDates = forecastResult.forecast.map(f => f.date);
    const futurePoints = forecastResult.forecast.map(f => f.point);
    const lowerBounds = forecastResult.forecast.map(f => f.lower95);
    const upperBounds = forecastResult.forecast.map(f => f.upper95);

    const allLabels = [...histDates, ...futureDates];

    // Align historical values with nulls for future
    const historicalSeries = [...histValues, ...Array(futureDates.length).fill(null)];

    // Align future values with nulls for historical (connecting last point)
    const futureSeries = [...Array(histDates.length - 1).fill(null), histValues[histValues.length - 1], ...futurePoints];
    const upperSeries = [...Array(histDates.length - 1).fill(null), histValues[histValues.length - 1], ...upperBounds];
    const lowerSeries = [...Array(histDates.length - 1).fill(null), histValues[histValues.length - 1], ...lowerBounds];

    this.instances.forecast = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: allLabels,
        datasets: [
          {
            label: 'Historical Daily Spend',
            data: historicalSeries,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.2
          },
          {
            label: 'Holt-Winters 30-Day Forecast',
            data: futureSeries,
            borderColor: '#10b981',
            borderWidth: 2.5,
            borderDash: [5, 5],
            pointRadius: 3,
            tension: 0.2
          },
          {
            label: '95% Upper Bound',
            data: upperSeries,
            borderColor: 'rgba(16, 185, 129, 0.2)',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            fill: '+1',
            pointRadius: 0,
            borderWidth: 1
          },
          {
            label: '95% Lower Bound',
            data: lowerSeries,
            borderColor: 'rgba(16, 185, 129, 0.2)',
            pointRadius: 0,
            borderWidth: 1,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: theme.textColor } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${currencySymbol}${ctx.raw !== null ? ctx.raw.toLocaleString() : 'N/A'}`
            }
          }
        },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, maxTicksLimit: 12 } },
          y: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => `${currencySymbol}${v}` } }
        }
      }
    });
  }

  /**
   * 7. Monte Carlo Simulation Distribution
   */
  static renderMonteCarloChart(mcData, currencySymbol = '$') {
    const canvas = document.getElementById('monteCarloChart');
    if (!canvas) return;
    this.destroyChart('monteCarlo');

    const theme = this.getThemeColors();

    this.instances.monteCarlo = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: mcData.binLabels,
        datasets: [{
          label: 'Simulated Outcomes Frequency',
          data: mcData.binFrequencies,
          backgroundColor: 'rgba(99, 102, 241, 0.75)',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Frequency: ${ctx.raw} runs out of ${mcData.iterations}`
            }
          }
        },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, maxRotation: 45 } },
          y: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor } }
        }
      }
    });
  }
}
