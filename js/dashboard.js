/* ============================================================
 * dashboard.js — Dashboard KPIs, Chart.js charts, alerts
 * Namespace: window.Dashboard
 * ============================================================ */
(function (global) {
  'use strict';
  var Dashboard = {};
  var Utils = global.Utils;
  var Accounting = global.Accounting;

  var charts = {};

  function $id(id) { return document.getElementById(id); }

  Dashboard.destroyCharts = function () {
    Object.keys(charts).forEach(function (k) {
      if (charts[k]) { charts[k].destroy(); delete charts[k]; }
    });
  };

  Dashboard.render = function () {
    if (typeof Chart === 'undefined') { console.warn('Chart.js not loaded'); return; }
    Dashboard.destroyCharts();
    var user = global.Auth.getCurrentUser();
    var today = Utils.todayStr();
    var monthStart = today.slice(0, 7) + '-01';
    var curMonth = today.slice(0, 7);

    // Theme-aware chart colors (read active theme tokens)
    var css = getComputedStyle(document.documentElement);
    var accent = css.getPropertyValue('--accent').trim() || '#6366f1';
    var chartGrid = css.getPropertyValue('--chart-grid').trim() || '#eef0f6';
    var chartTick = css.getPropertyValue('--chart-tick').trim() || '#98a2b3';
    var rgba = function (hex, a) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    };

    // KPIs
    var cashAccounts = Accounting.getAccounts().filter(function (a) { return a.type === 'Asset' && /(cash|bank)/i.test(a.name); });
    var cash = 0;
    cashAccounts.forEach(function (a) { cash += Accounting.accountBalance(a.id).net; });
    var pnl = Accounting.getPnl(monthStart, today);
    var bs = Accounting.getBalanceSheet(today);
    $id('kpiCash').textContent = Utils.fmtMoney(cash);
    $id('kpiRevenueMTD').textContent = Utils.fmtMoney(pnl.totalRevenue);
    $id('kpiExpensesMTD').textContent = Utils.fmtMoney(pnl.totalExpenses);
    $id('kpiNetIncome').textContent = Utils.fmtMoney(pnl.netIncome);
    $id('kpiNetIncome').className = 'kpi-value ' + (pnl.netIncome < 0 ? 'text-danger' : 'text-success');
    $id('kpiTotalAssets').textContent = Utils.fmtMoney(bs.totalAssets);
    $id('kpiTotalLiabilities').textContent = Utils.fmtMoney(bs.totalLiabilities);
    $id('kpiTotalEquity').textContent = Utils.fmtMoney(bs.totalEquity);
    $id('kpiEntries').textContent = Accounting.getEntries().length;

    // Cash flow last 12 months
    var months = [], flowData = [];
    var d = new Date();
    for (var i = 11; i >= 0; i--) {
      var m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      var key = m.getFullYear() + '-' + ('0' + (m.getMonth() + 1)).slice(-2);
      var from = key + '-01', to = Accounting.periodEnd(key);
      var cf = Accounting.getCashFlow(from, to, 'direct');
      months.push(m.toLocaleString('en', { month: 'short' }));
      flowData.push(Math.round(cf.netFlow * 100) / 100);
    }
    charts.cashFlow = new Chart($id('chartCashFlow'), {
      type: 'line',
      data: { labels: months, datasets: [{ label: 'Net Cash Flow', data: flowData, borderColor: accent, backgroundColor: rgba(accent, 0.14), fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: accent }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: chartGrid }, ticks: { color: chartTick } }, x: { ticks: { color: chartTick } } } }
    });

    // Revenue vs expenses (6 months)
    var revData = [], expData = [], labels6 = [];
    for (var j = 5; j >= 0; j--) {
      var m6 = new Date(d.getFullYear(), d.getMonth() - j, 1);
      var key6 = m6.getFullYear() + '-' + ('0' + (m6.getMonth() + 1)).slice(-2);
      var p = Accounting.getPnl(key6 + '-01', Accounting.periodEnd(key6));
      labels6.push(m6.toLocaleString('en', { month: 'short' }));
      revData.push(Math.round(p.totalRevenue * 100) / 100);
      expData.push(Math.round(p.totalExpenses * 100) / 100);
    }
    charts.revExp = new Chart($id('chartRevExp'), {
      type: 'bar',
      data: { labels: labels6, datasets: [
        { label: 'Revenue', data: revData, backgroundColor: 'rgba(16,185,129,0.78)', borderRadius: 6, borderSkipped: false },
        { label: 'Expenses', data: expData, backgroundColor: 'rgba(244,63,94,0.72)', borderRadius: 6, borderSkipped: false }
      ]},
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: chartGrid }, ticks: { color: chartTick } }, x: { ticks: { color: chartTick } } } }
    });

    // Expense pie (current month)
    var pnlCur = Accounting.getPnl(monthStart, today);
    var pieLabels = [], pieData = [], pieColors = ['#6366f1', '#8b5cf6', '#06b6d4', '#14b8a6', '#f59e0b', '#f43f5e', '#ec4899', '#10b981', '#0ea5e9', '#94a3b8'];
    pnlCur.expenses.forEach(function (r, idx) {
      pieLabels.push(r.account.name);
      pieData.push(Math.round(r.amount * 100) / 100);
    });
    if (!pieData.length) { pieLabels = ['No expenses']; pieData = [1]; }
    charts.expensePie = new Chart($id('chartExpensePie'), {
      type: 'doughnut',
      data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors.slice(0, pieData.length), borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });

    // Recent entries
    var entries = Accounting.getEntries().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 6);
    var rows = entries.map(function (e) {
      var t = Accounting.entryTotals(Accounting.entryLines(e.id));
      var badge = e.status === 'approved' ? 'text-bg-success' : e.status === 'draft' ? 'text-bg-secondary' : e.status === 'rejected' ? 'text-bg-danger' : 'text-bg-primary';
      return '<tr><td>' + Utils.fmtDate(e.date) + '</td><td>' + Utils.escapeHtml(e.reference || '—') + '</td><td>' + Utils.escapeHtml(e.description) + '</td>' +
        '<td class="text-end">' + Utils.fmtMoney(Math.max(t.debit, t.credit)) + '</td>' +
        '<td><span class="badge ' + badge + '">' + e.status + '</span></td></tr>';
    });
    $id('recentEntriesBody').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="text-center text-muted py-3">No journal entries yet</td></tr>';

    // Alerts
    var alerts = [];
    if (cash < 1000) alerts.push({ type: 'danger', text: 'Cash balance is low: ' + Utils.fmtMoney(cash) });
    if (Accounting.getAccounts().length === 0) alerts.push({ type: 'warning', text: 'No chart of accounts. Create accounts or load sample data.' });
    var bv = Accounting.getBudgetVariance(curMonth);
    bv.rows.forEach(function (r) {
      if (r.hasBudget && !r.favorable) alerts.push({ type: 'danger', text: 'Over budget: ' + r.account.name + ' (' + Utils.fmtMoney(r.budget) + ' budget / ' + Utils.fmtMoney(r.actual) + ' actual)' });
    });
    var unrec = Accounting.getEntries().filter(function (e) { return e.status === 'active' && !Accounting.isReconciled(e.id); }).length;
    if (unrec > 0) alerts.push({ type: 'info', text: unrec + ' entry(s) not yet reconciled' });
    if (global.Auth.passwordExpired(user)) alerts.push({ type: 'warning', text: 'Your password has expired. Change it from My Profile.' });
    if (!alerts.length) alerts.push({ type: 'success', text: 'All systems normal. No alerts.' });
    $id('dashboardAlerts').innerHTML = alerts.map(function (a) {
      return '<div class="alert alert-' + a.type + ' py-2 small mb-2"><i class="bi bi-exclamation-triangle"></i> ' + Utils.escapeHtml(a.text) + '</div>';
    }).join('');
  };

  global.Dashboard = Dashboard;
})(typeof window !== 'undefined' ? window : globalThis);
