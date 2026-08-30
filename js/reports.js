/* ============================================================
 * reports.js — Financial report rendering (P&L, Balance Sheet,
 * Cash Flow, Retained Earnings, Comparative, Budget)
 * Namespace: window.Reports
 * ============================================================ */
(function (global) {
  'use strict';
  var Reports = {};
  var Utils = global.Utils;
  var Accounting = global.Accounting;

  function $id(id) { return document.getElementById(id); }
  function money(n) { return Utils.fmtMoney(n); }
  function moneyCls(n) { return n < 0 ? 'text-danger' : ''; }

  function reportHeader(title, subtitle) {
    return '<div class="report-header mb-3"><h5 class="mb-0">' + Utils.escapeHtml(title) + '</h5><div class="text-muted small">' + Utils.escapeHtml(subtitle || '') + '</div></div>';
  }
  function tableHtml(headers, rows, totalsRow, cls) {
    var h = '<div class="table-responsive"><table class="table table-sm report-table mb-0 ' + (cls || '') + '"><thead><tr>';
    headers.forEach(function (x) { h += '<th class="' + (x === 'Account' || x === 'Item' ? '' : 'text-end') + '">' + x + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr>';
      r.forEach(function (c, i) {
        h += '<td class="' + (i > 0 ? 'text-end ' + moneyCls(parseFloat(c) || 0) : '') + '">' + (c === undefined || c === null || c === '' ? '' : c) + '</td>';
      });
      h += '</tr>';
    });
    if (totalsRow) {
      h += '<tr class="table-light fw-bold">';
      totalsRow.forEach(function (c, i) { h += '<td class="' + (i > 0 ? 'text-end' : '') + '">' + c + '</td>'; });
      h += '</tr>';
    }
    h += '</tbody></table></div>';
    return h;
  }

  Reports.monthArithmetic = function (period, delta) {
    var y = parseInt(period.slice(0, 4), 10), m = parseInt(period.slice(5, 7), 10);
    var d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  };

  Reports.setDefaultPeriods = function () {
    var now = new Date();
    var curMonth = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
    var fisStart = Accounting.fiscalStart();
    if ($id('pnlFrom')) $id('pnlFrom').value = fisStart;
    if ($id('pnlTo')) $id('pnlTo').value = Utils.todayStr();
    if ($id('bsAsOf')) $id('bsAsOf').value = Utils.todayStr();
    if ($id('cfFrom')) $id('cfFrom').value = fisStart;
    if ($id('cfTo')) $id('cfTo').value = Utils.todayStr();
    if ($id('reFrom')) $id('reFrom').value = fisStart;
    if ($id('reTo')) $id('reTo').value = Utils.todayStr();
    if ($id('cmpPeriod')) $id('cmpPeriod').value = curMonth;
    if ($id('budgetPeriod')) $id('budgetPeriod').value = curMonth;
    if ($id('journalFrom')) $id('journalFrom').value = fisStart;
    if ($id('journalTo')) $id('journalTo').value = Utils.todayStr();
    if ($id('ledgerFrom')) $id('ledgerFrom').value = fisStart;
    if ($id('ledgerTo')) $id('ledgerTo').value = Utils.todayStr();
    if ($id('reconFrom')) $id('reconFrom').value = fisStart;
    if ($id('reconTo')) $id('reconTo').value = Utils.todayStr();
    if ($id('tbAsOf')) $id('tbAsOf').value = Utils.todayStr();
  };

  Reports.renderPnl = function () {
    var from = $id('pnlFrom').value, to = $id('pnlTo').value;
    var pnl = Accounting.getPnl(from, to);
    var rows = [];
    pnl.revenue.forEach(function (r) {
      rows.push([r.account.accountNumber + ' ' + r.account.name, money(r.amount)]);
    });
    var html = reportHeader('Income Statement (Profit & Loss)', Utils.fmtDate(from) + ' to ' + Utils.fmtDate(to));
    html += '<h6 class="text-muted">Revenue</h6>' + tableHtml(['Account', 'Amount'], rows, rows.length ? [['Total Revenue', money(pnl.totalRevenue)]] : null);
    rows = [];
    pnl.expenses.forEach(function (r) {
      rows.push([r.account.accountNumber + ' ' + r.account.name, money(r.amount)]);
    });
    html += '<h6 class="text-muted mt-3">Expenses</h6>' + tableHtml(['Account', 'Amount'], rows, [['Total Expenses', money(pnl.totalExpenses)]]);
    html += '<div class="mt-3 p-2 report-total rounded d-flex justify-content-between fw-bold"><span>NET INCOME</span><span class="' + moneyCls(pnl.netIncome) + '">' + money(pnl.netIncome) + '</span></div>';
    $id('reportPnl').innerHTML = html;
  };

  Reports.renderBs = function () {
    var asOf = $id('bsAsOf').value;
    var bs = Accounting.getBalanceSheet(asOf);
    var html = reportHeader('Balance Sheet', 'As of ' + Utils.fmtDate(asOf));
    var aRows = bs.assets.map(function (r) { return [r.account.accountNumber + ' ' + r.account.name, money(r.amount)]; });
    var lRows = bs.liabilities.map(function (r) { return [r.account.accountNumber + ' ' + r.account.name, money(r.amount)]; });
    var eRows = bs.equity.map(function (r) { return [(r.synthetic ? '' : r.account.accountNumber + ' ') + r.label, money(r.amount)]; });
    html += '<h6 class="text-muted">Assets</h6>' + tableHtml(['Account', 'Amount'], aRows, [['Total Assets', money(bs.totalAssets)]]);
    html += '<h6 class="text-muted mt-3">Liabilities</h6>' + tableHtml(['Account', 'Amount'], lRows, [['Total Liabilities', money(bs.totalLiabilities)]]);
    html += '<h6 class="text-muted mt-3">Equity</h6>' + tableHtml(['Account', 'Amount'], eRows, [['Total Equity', money(bs.totalEquity)]]);
    html += '<div class="mt-3 p-2 rounded d-flex justify-content-between ' + (bs.balanced ? 'bg-success-subtle' : 'bg-danger-subtle') + ' fw-bold">' +
      '<span>Assets = Liabilities + Equity</span><span>' + (bs.balanced ? 'BALANCED ✓' : 'DIFFERENCE ' + money(bs.difference)) + '</span></div>';
    $id('reportBs').innerHTML = html;
  };

  Reports.renderCf = function () {
    var from = $id('cfFrom').value, to = $id('cfTo').value, method = $id('cfMethod').value;
    var cf = Accounting.getCashFlow(from, to, method);
    var html = reportHeader('Statement of Cash Flows (' + method.charAt(0).toUpperCase() + method.slice(1) + ')', Utils.fmtDate(from) + ' to ' + Utils.fmtDate(to));
    var oRows = cf.operating.map(function (r) { return ['', r.label, money(r.amount)]; });
    html += '<h6 class="text-muted">Operating Activities</h6>' + tableHtml(['', 'Item', 'Amount'], oRows, [['', 'Net operating cash flow', money(cf.operatingTotal)]]);
    var iRows = cf.investing.map(function (r) { return ['', r.account ? r.account.name : r.label, money(r.amount)]; });
    html += '<h6 class="text-muted mt-3">Investing Activities</h6>' + tableHtml(['', 'Item', 'Amount'], iRows, [['', 'Net investing cash flow', money(cf.investTotal)]]);
    var fRows = cf.financing.map(function (r) { return ['', r.account ? r.account.name : r.label, money(r.amount)]; });
    html += '<h6 class="text-muted mt-3">Financing Activities</h6>' + tableHtml(['', 'Item', 'Amount'], fRows, [['', 'Net financing cash flow', money(cf.financeTotal)]]);
    html += '<div class="mt-3 p-2 report-total rounded d-flex justify-content-between fw-bold"><span>Net Change in Cash</span><span>' + money(cf.netFlow) + '</span></div>';
    html += '<div class="mt-2 d-flex justify-content-between small"><span>Beginning cash: ' + money(cf.cashStart) + '</span><span>Ending cash: ' + money(cf.cashEnd) + '</span></div>';
    $id('reportCf').innerHTML = html;
  };

  Reports.renderRe = function () {
    var from = $id('reFrom').value, to = $id('reTo').value;
    var re = Accounting.getRetainedEarnings(from, to);
    var html = reportHeader('Statement of Retained Earnings', Utils.fmtDate(from) + ' to ' + Utils.fmtDate(to));
    html += tableHtml(['Item', 'Amount'], [
      ['Beginning Retained Earnings', money(re.beginning)],
      ['Add: Net Income', money(re.netIncome)],
      ['Ending Retained Earnings', money(re.ending)]
    ]);
    $id('reportRe').innerHTML = html;
  };

  Reports.comparativeData = function (type, period) {
    if (!period) return null;
    var cur = period, prev;
    if (type === 'month') {
      prev = Reports.monthArithmetic(period, -1);
    } else {
      var py = (parseInt(period.slice(0, 4), 10) - 1) + period.slice(4);
      prev = py;
    }
    var curPnl = Accounting.getPnl(cur + '-01', Accounting.periodEnd(cur));
    var prevPnl = Accounting.getPnl(prev + '-01', Accounting.periodEnd(prev));
    var map = {};
    curPnl.revenue.forEach(function (r) { map[r.account.id] = { account: r.account, current: r.amount, previous: 0 }; });
    curPnl.expenses.forEach(function (r) {
      if (!map[r.account.id]) map[r.account.id] = { account: r.account, current: 0, previous: 0 };
      map[r.account.id].current = r.amount;
    });
    prevPnl.revenue.forEach(function (r) { if (!map[r.account.id]) map[r.account.id] = { account: r.account, current: 0, previous: 0 }; map[r.account.id].previous = r.amount; });
    prevPnl.expenses.forEach(function (r) { if (!map[r.account.id]) map[r.account.id] = { account: r.account, current: 0, previous: 0 }; map[r.account.id].previous = r.amount; });
    var rows = Object.keys(map).map(function (id) {
      var m = map[id];
      var variance = m.current - m.previous;
      var variancePct = m.previous !== 0 ? (variance / Math.abs(m.previous)) * 100 : (m.current !== 0 ? 100 : 0);
      return {
        account: m.account.accountNumber + ' ' + m.account.name + ' (' + m.account.type + ')',
        current: m.current, previous: m.previous, variance: variance, variancePct: variancePct
      };
    });
    rows.sort(function (a, b) { return a.account < b.account ? -1 : 1; });
    return {
      type: type, currentLabel: cur, previousLabel: prev, rows: rows,
      totalCurrent: rows.reduce(function (s, r) { return s + r.current; }, 0),
      totalPrevious: rows.reduce(function (s, r) { return s + r.previous; }, 0),
      totalVariance: rows.reduce(function (s, r) { return s + r.variance; }, 0),
      totalVariancePct: rows.reduce(function (s, r) { return s + r.variancePct; }, 0) / (rows.length || 1)
    };
  };

  Reports.renderCmp = function () {
    var type = $id('cmpType').value, period = $id('cmpPeriod').value;
    var cmp = Reports.comparativeData(type, period);
    if (!cmp) { $id('reportCmp').innerHTML = '<div class="text-muted">Select a period</div>'; return; }
    var rows = cmp.rows.map(function (r) {
      return [r.account, money(r.current), money(r.previous), money(r.variance), (r.variancePct >= 0 ? '+' : '') + r.variancePct.toFixed(1) + '%'];
    });
    var html = reportHeader(
      type === 'month' ? 'Comparative Income Statement (Month-over-Month)' : 'Comparative Income Statement (Year-over-Year)',
      cmp.currentLabel + ' vs ' + cmp.previousLabel
    );
    html += tableHtml(['Account', cmp.currentLabel, cmp.previousLabel, 'Variance', 'Variance %'], rows, [
      ['TOTALS', money(cmp.totalCurrent), money(cmp.totalPrevious), money(cmp.totalVariance), (cmp.totalVariancePct >= 0 ? '+' : '') + cmp.totalVariancePct.toFixed(1) + '%']
    ]);
    $id('reportCmp').innerHTML = html;
  };

  Reports.renderBudgetReport = function () {
    var period = $id('budgetPeriod').value;
    var bv = Accounting.getBudgetVariance(period);
    var rows = bv.rows.map(function (r) {
      var badge = r.hasBudget
        ? (r.favorable ? '<span class="badge text-bg-success">Favorable</span>' : '<span class="badge text-bg-danger">Unfavorable</span>')
        : '<span class="badge text-bg-secondary">No budget</span>';
      return [r.account.accountNumber + ' ' + r.account.name, money(r.budget), money(r.actual), money(r.variance), badge];
    });
    var html = reportHeader('Budget vs Actual — ' + period, 'Variance = Actual − Budget');
    html += tableHtml(['Account', 'Budget', 'Actual', 'Variance', 'Status'], rows, [
      ['TOTALS', money(bv.totalBudget), money(bv.totalActual), money(bv.totalVariance), '']
    ]);
    // Simple bar visualization
    var max = Math.max.apply(null, bv.rows.map(function (r) { return Math.max(Math.abs(r.budget), Math.abs(r.actual)); }).concat([1]));
    html += '<div class="mt-3"><h6 class="text-muted">Actual vs Budget (by account)</h6>';
    bv.rows.slice(0, 12).forEach(function (r) {
      var bw = Math.max(2, Math.round((Math.abs(r.budget) / max) * 100));
      var aw = Math.max(2, Math.round((Math.abs(r.actual) / max) * 100));
      html += '<div class="mb-1 small"><div class="d-flex justify-content-between"><span>' + Utils.escapeHtml(r.account.accountNumber + ' ' + r.account.name) + '</span><span>' + money(r.budget) + ' / ' + money(r.actual) + '</span></div>' +
        '<div class="bar-row"><div class="bar budget" style="width:' + bw + '%"></div></div>' +
        '<div class="bar-row"><div class="bar actual ' + (r.favorable ? 'bg-success' : 'bg-danger') + '" style="width:' + aw + '%"></div></div></div>';
    });
    html += '</div>';
    $id('reportBudget').innerHTML = html;
  };

  Reports.switchTab = function (name) {
    var tabs = ['pnl', 'balance-sheet', 'cash-flow', 'retained', 'comparative'];
    tabs.forEach(function (t) {
      var btn = document.querySelector('#reportTabs .nav-link[data-report="' + t + '"]');
      if (btn) btn.classList.toggle('active', t === name);
      var pane = $id('report' + (t === 'pnl' ? 'Pnl' : t === 'balance-sheet' ? 'Bs' : t === 'cash-flow' ? 'Cf' : t === 'retained' ? 'Re' : 'Cmp') + 'Pane');
      if (pane) pane.classList.toggle('d-none', t !== name);
    });
  };

  Reports.renderAll = function () {
    if (!$id('reportPnl')) return;
    Reports.renderPnl();
    Reports.renderBs();
    Reports.renderCf();
    Reports.renderRe();
    Reports.renderCmp();
  };

  Reports.print = function () {
    var active = document.querySelector('.report-pane:not(.d-none)');
    if (!active) return;
    var html = '<html><head><title>Report</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"><style>body{padding:24px;font-family:system-ui}table{width:100%;border-collapse:collapse}td,th{padding:6px 10px;border-bottom:1px solid #eee}</style></head><body>' + active.innerHTML + '</body></html>';
    var w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 300);
    global.Audit.log('report_generated', 'Printed report to PDF via browser print', { entityType: 'report' });
  };

  global.Reports = Reports;
})(typeof window !== 'undefined' ? window : globalThis);
