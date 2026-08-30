/* ============================================================
 * excel-handler.js — SheetJS Excel import/export, multi-sheet
 * workbooks, templates, report exports.
 * Namespace: window.Excel
 * NOTE: community SheetJS supports column widths, number
 * formats, autofilters and SUM formulas (no cell colors/bold).
 * ============================================================ */
(function (global) {
  'use strict';
  var Excel = {};
  var Utils = global.Utils;
  var Audit = global.Audit;
  var Accounting = global.Accounting;
  var CSV = global.CSV;

  function cellAddr(r, c) { return XLSX.utils.encode_cell({ r: r, c: c }); }

  Excel.exportWorkbook = function (sheets, filename) {
    if (typeof XLSX === 'undefined') { Utils.toast('SheetJS library not loaded', 'error'); return; }
    var wb = XLSX.utils.book_new();
    sheets.forEach(function (s) {
      var aoa = [s.header].concat(s.rows || []);
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      if (s.widths) ws['!cols'] = s.widths.map(function (w) { return { wch: w }; });
      if (s.numberCols) {
        s.numberCols.forEach(function (ci) {
          for (var r = 1; r < aoa.length; r++) {
            var cell = ws[cellAddr(r, ci)];
            if (cell && typeof cell.v === 'number') cell.z = '#,##0.00';
          }
        });
      }
      if (s.formulaRows) {
        s.formulaRows.forEach(function (fr) {
          var r = aoa.length + fr.offset;
          fr.cells.forEach(function (fc) {
            ws[cellAddr(r, fc.c)] = { t: 'n', f: fc.f, z: fc.z || '#,##0.00' };
          });
        });
      }
      if (aoa.length > 1) {
        var lastCol = XLSX.utils.encode_col(aoa[0].length - 1);
        ws['!autofilter'] = { ref: 'A1:' + lastCol + aoa.length };
      }
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    });
    XLSX.writeFile(wb, filename);
  };

  /* ---------------- Full multi-sheet export ---------------- */
  Excel.exportAllWorkbook = function () {
    if (!global.Permissions || !global.Permissions.can('export_data')) { Utils.toast('Not permitted: export requires the Accountant or Admin role', 'error'); return; }
    var stamp = Utils.todayStr();
    var sheets = [];

    // 1. Chart of Accounts
    var accs = Accounting.getAccounts().map(function (a) {
      var p = a.parentId ? Accounting.getAccount(a.parentId) : null;
      var b = Accounting.accountBalance(a.id);
      var bal = a.normalBalance === 'Credit' ? b.credit - b.debit : b.debit - b.credit;
      return [a.accountNumber, a.name, a.type, p ? p.accountNumber : '', a.normalBalance, Math.round(bal * 100) / 100, a.status];
    });
    sheets.push({ name: 'Chart of Accounts', header: ['Account Number', 'Name', 'Type', 'Parent', 'Normal Balance', 'Balance', 'Status'], rows: accs, widths: [14, 28, 12, 12, 14, 14, 10], numberCols: [5] });

    // 2. Journal Entries
    var jrows = [];
    Accounting.getEntries().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (e) {
      Accounting.entryLines(e.id).forEach(function (l) {
        var acc = Accounting.getAccount(l.accountId);
        jrows.push([e.date, e.reference, e.description, acc ? acc.accountNumber : '', acc ? acc.name : '', l.debit, l.credit, e.status]);
      });
    });
    sheets.push({ name: 'Journal Entries', header: ['Date', 'Reference', 'Description', 'Account Number', 'Account Name', 'Debit', 'Credit', 'Status'], rows: jrows, widths: [12, 14, 30, 14, 24, 12, 12, 10], numberCols: [5, 6] });

    // 3. General Ledger (all lines with account)
    var lrows = [];
    Accounting.getAccounts().forEach(function (acc) {
      Accounting.entryLines('').length; // no-op
      var lg = Accounting.getLedger(acc.id, {});
      lg.rows.forEach(function (r) {
        lrows.push([acc.accountNumber + ' ' + acc.name, r.date, r.reference, r.description, r.debit, r.credit, r.balance]);
      });
    });
    sheets.push({ name: 'General Ledger', header: ['Account', 'Date', 'Reference', 'Description', 'Debit', 'Credit', 'Running Balance'], rows: lrows, widths: [30, 12, 14, 30, 12, 12, 14], numberCols: [4, 5, 6] });

    // 4. Trial Balance
    var tb = Accounting.getTrialBalance({});
    var trows = tb.rows.map(function (r) {
      return [r.account ? r.account.accountNumber + ' — ' + r.account.name : r.label, Math.round(r.debit * 100) / 100, Math.round(r.credit * 100) / 100];
    });
    var tbLen = trows.length;
    var formulaRows = [{ offset: 0, cells: [
      { c: 0, f: '"TOTALS"' },
      { c: 1, f: tbLen ? '=SUM(B2:B' + (tbLen + 1) + ')' : '0' },
      { c: 2, f: tbLen ? '=SUM(C2:C' + (tbLen + 1) + ')' : '0' }
    ]}];
    sheets.push({ name: 'Trial Balance', header: ['Account', 'Debit', 'Credit'], rows: trows, widths: [40, 16, 16], numberCols: [1, 2], formulaRows: formulaRows });

    // 5. Income Statement
    var pnl = Accounting.getPnl(Accounting.fiscalStart(), Utils.todayStr());
    var pnlRows = [];
    pnl.revenue.forEach(function (r) { pnlRows.push([r.account.accountNumber + ' ' + r.account.name, Math.round(r.amount * 100) / 100]); });
    pnlRows.push(['Total Revenue', Math.round(pnl.totalRevenue * 100) / 100]);
    pnl.expenses.forEach(function (r) { pnlRows.push([r.account.accountNumber + ' ' + r.account.name, Math.round(r.amount * 100) / 100]); });
    pnlRows.push(['Total Expenses', Math.round(pnl.totalExpenses * 100) / 100]);
    pnlRows.push(['NET INCOME', Math.round(pnl.netIncome * 100) / 100]);
    sheets.push({ name: 'Income Statement', header: ['Account', 'Amount'], rows: pnlRows, widths: [40, 16], numberCols: [1] });

    // 6. Balance Sheet
    var bs = Accounting.getBalanceSheet(Utils.todayStr());
    var bsRows = [];
    bs.assets.forEach(function (r) { bsRows.push(['Asset: ' + r.account.accountNumber + ' ' + r.account.name, Math.round(r.amount * 100) / 100]); });
    bsRows.push(['Total Assets', Math.round(bs.totalAssets * 100) / 100]);
    bs.liabilities.forEach(function (r) { bsRows.push(['Liability: ' + r.account.accountNumber + ' ' + r.account.name, Math.round(r.amount * 100) / 100]); });
    bsRows.push(['Total Liabilities', Math.round(bs.totalLiabilities * 100) / 100]);
    bs.equity.forEach(function (r) { bsRows.push([(r.synthetic ? 'Equity: ' : 'Equity: ' + r.account.accountNumber + ' ') + r.label, Math.round(r.amount * 100) / 100]); });
    bsRows.push(['Total Equity', Math.round(bs.totalEquity * 100) / 100]);
    sheets.push({ name: 'Balance Sheet', header: ['Account', 'Amount'], rows: bsRows, widths: [40, 16], numberCols: [1] });

    // 7. Cash Flow
    var cf = Accounting.getCashFlow(Accounting.fiscalStart(), Utils.todayStr(), 'direct');
    var cfRows = [];
    cf.operating.forEach(function (r) { cfRows.push(['Operating', r.label, Math.round(r.amount * 100) / 100]); });
    cfRows.push(['Operating', 'Net operating cash flow', Math.round(cf.operatingTotal * 100) / 100]);
    cf.investing.forEach(function (r) { cfRows.push(['Investing', r.account ? r.account.name : r.label, Math.round(r.amount * 100) / 100]); });
    cfRows.push(['Investing', 'Net investing cash flow', Math.round(cf.investTotal * 100) / 100]);
    cf.financing.forEach(function (r) { cfRows.push(['Financing', r.account ? r.account.name : r.label, Math.round(r.amount * 100) / 100]); });
    cfRows.push(['Financing', 'Net financing cash flow', Math.round(cf.financeTotal * 100) / 100]);
    cfRows.push(['Total', 'Net change in cash', Math.round(cf.netFlow * 100) / 100]);
    sheets.push({ name: 'Cash Flow', header: ['Category', 'Item', 'Amount'], rows: cfRows, widths: [14, 34, 16], numberCols: [2] });

    // 8. Budget
    var cur = new Date();
    var period = cur.getFullYear() + '-' + ('0' + (cur.getMonth() + 1)).slice(-2);
    var bv = Accounting.getBudgetVariance(period);
    var bRows = bv.rows.map(function (r) {
      return [r.account.accountNumber + ' ' + r.account.name, Math.round(r.budget * 100) / 100, Math.round(r.actual * 100) / 100, Math.round(r.variance * 100) / 100, r.favorable ? 'Favorable' : 'Unfavorable'];
    });
    sheets.push({ name: 'Budget ' + period, header: ['Account', 'Budget', 'Actual', 'Variance', 'Status'], rows: bRows, widths: [36, 14, 14, 14, 12], numberCols: [1, 2, 3] });

    Excel.exportWorkbook(sheets, 'accounting-export-' + stamp + '.xlsx');
    Audit.log('data_exported', 'Exported full workbook (8 sheets) to Excel', { entityType: 'workbook' });
  };

  /* ---------------- Report Excel exports ---------------- */
  Excel.exportReportExcel = function (kind) {
    if (!global.Permissions || !global.Permissions.can('export_data')) { Utils.toast('Not permitted: export requires the Accountant or Admin role', 'error'); return; }
    var $ = function (id) { return document.getElementById(id); };
    if (kind === 'accounts') {
      var accs = Accounting.getAccounts().map(function (a) {
        var p = a.parentId ? Accounting.getAccount(a.parentId) : null;
        var b = Accounting.accountBalance(a.id);
        var bal = a.normalBalance === 'Credit' ? b.credit - b.debit : b.debit - b.credit;
        return [a.accountNumber, a.name, a.type, p ? p.accountNumber : '', a.normalBalance, Math.round(bal * 100) / 100, a.status];
      });
      Excel.exportWorkbook([{ name: 'Chart of Accounts', header: ['Account Number', 'Name', 'Type', 'Parent', 'Normal Balance', 'Balance', 'Status'], rows: accs, widths: [14, 28, 12, 12, 14, 14, 10], numberCols: [5] }], 'chart-of-accounts-' + Utils.todayStr() + '.xlsx');
    } else if (kind === 'journal') {
      var jrows = [];
      Accounting.getEntries().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (e) {
        Accounting.entryLines(e.id).forEach(function (l) {
          var acc = Accounting.getAccount(l.accountId);
          jrows.push([e.date, e.reference, e.description, acc ? acc.accountNumber : '', acc ? acc.name : '', l.debit, l.credit, e.status]);
        });
      });
      Excel.exportWorkbook([{ name: 'Journal Entries', header: ['Date', 'Reference', 'Description', 'Account Number', 'Account Name', 'Debit', 'Credit', 'Status'], rows: jrows, widths: [12, 14, 30, 14, 24, 12, 12, 10], numberCols: [5, 6] }], 'journal-entries-' + Utils.todayStr() + '.xlsx');
    } else if (kind === 'trial-balance') {
      var tb = Accounting.getTrialBalance({});
      var trows = tb.rows.map(function (r) {
        return [r.account ? r.account.accountNumber + ' — ' + r.account.name : r.label, Math.round(r.debit * 100) / 100, Math.round(r.credit * 100) / 100];
      });
      var fRows = [{ offset: 0, cells: [
        { c: 0, f: '"TOTALS"' },
        { c: 1, f: trows.length ? '=SUM(B2:B' + (trows.length + 1) + ')' : '0' },
        { c: 2, f: trows.length ? '=SUM(C2:C' + (trows.length + 1) + ')' : '0' }
      ]}];
      Excel.exportWorkbook([{ name: 'Trial Balance', header: ['Account', 'Debit', 'Credit'], rows: trows, widths: [40, 16, 16], numberCols: [1, 2], formulaRows: fRows }], 'trial-balance-' + Utils.todayStr() + '.xlsx');
    } else if (kind === 'ledger') {
      var accId = $('ledgerAccount') ? $('ledgerAccount').value : '';
      var acc = Accounting.getAccount(accId);
      if (!acc) { Utils.toast('Select an account first', 'warning'); return; }
      var lg = Accounting.getLedger(accId, {});
      var lrows = lg.rows.map(function (r) { return [r.date, r.reference, r.description, r.debit, r.credit, r.balance]; });
      Excel.exportWorkbook([{ name: 'Ledger ' + acc.accountNumber, header: ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'], rows: lrows, widths: [12, 14, 30, 12, 12, 14], numberCols: [3, 4, 5] }], 'ledger-' + acc.accountNumber + '-' + Utils.todayStr() + '.xlsx');
    } else if (kind === 'pnl') {
      var from = $('pnlFrom').value, to = $('pnlTo').value;
      var pnl = Accounting.getPnl(from, to);
      var rows = [];
      pnl.revenue.forEach(function (r) { rows.push([r.account.accountNumber + ' ' + r.account.name, r.amount]); });
      rows.push(['Total Revenue', pnl.totalRevenue]);
      pnl.expenses.forEach(function (r) { rows.push([r.account.accountNumber + ' ' + r.account.name, r.amount]); });
      rows.push(['Total Expenses', pnl.totalExpenses]);
      rows.push(['NET INCOME', pnl.netIncome]);
      Excel.exportWorkbook([{ name: 'Income Statement', header: ['Account', 'Amount'], rows: rows, widths: [40, 16], numberCols: [1] }], 'income-statement-' + from + '-to-' + to + '.xlsx');
    } else if (kind === 'balance-sheet') {
      var asOf = $('bsAsOf').value;
      var bs = Accounting.getBalanceSheet(asOf);
      var rows = [];
      bs.assets.forEach(function (r) { rows.push([r.account.accountNumber + ' ' + r.account.name, r.amount]); });
      rows.push(['Total Assets', bs.totalAssets]);
      bs.liabilities.forEach(function (r) { rows.push([r.account.accountNumber + ' ' + r.account.name, r.amount]); });
      rows.push(['Total Liabilities', bs.totalLiabilities]);
      bs.equity.forEach(function (r) { rows.push([(r.synthetic ? '' : r.account.accountNumber + ' ') + r.label, r.amount]); });
      rows.push(['Total Equity', bs.totalEquity]);
      rows.push(['CHECK (A - L - E)', bs.difference]);
      Excel.exportWorkbook([{ name: 'Balance Sheet', header: ['Account', 'Amount'], rows: rows, widths: [40, 16], numberCols: [1] }], 'balance-sheet-' + asOf + '.xlsx');
    } else if (kind === 'cash-flow') {
      var cfFrom = $('cfFrom').value, cfTo = $('cfTo').value, method = $('cfMethod').value;
      var cf = Accounting.getCashFlow(cfFrom, cfTo, method);
      var rows = [];
      cf.operating.forEach(function (r) { rows.push(['Operating', r.label, r.amount]); });
      rows.push(['Operating', 'Subtotal', cf.operatingTotal]);
      cf.investing.forEach(function (r) { rows.push(['Investing', r.account ? r.account.name : r.label, r.amount]); });
      rows.push(['Investing', 'Subtotal', cf.investTotal]);
      cf.financing.forEach(function (r) { rows.push(['Financing', r.account ? r.account.name : r.label, r.amount]); });
      rows.push(['Financing', 'Subtotal', cf.financeTotal]);
      rows.push(['Total', 'Net change in cash', cf.netFlow]);
      rows.push(['Cash', 'Beginning cash', cf.cashStart]);
      rows.push(['Cash', 'Ending cash', cf.cashEnd]);
      Excel.exportWorkbook([{ name: 'Cash Flow (' + method + ')', header: ['Category', 'Item', 'Amount'], rows: rows, widths: [14, 34, 16], numberCols: [2] }], 'cash-flow-' + method + '-' + cfFrom + '-to-' + cfTo + '.xlsx');
    } else if (kind === 'retained') {
      var reFrom = $('reFrom').value, reTo = $('reTo').value;
      var re = Accounting.getRetainedEarnings(reFrom, reTo);
      Excel.exportWorkbook([{ name: 'Retained Earnings', header: ['Item', 'Amount'], rows: [['Beginning Retained Earnings', re.beginning], ['Net Income', re.netIncome], ['Ending Retained Earnings', re.ending]], widths: [30, 16], numberCols: [1] }], 'retained-earnings-' + reFrom + '-to-' + reTo + '.xlsx');
    } else if (kind === 'comparative') {
      var cmpType = $('cmpType').value, cmpPeriod = $('cmpPeriod').value;
      var cmp = Reports ? Reports.comparativeData(cmpType, cmpPeriod) : null;
      if (!cmp) return;
      var rows = cmp.rows.map(function (r) {
        return [r.account, r.current, r.previous, r.variance, r.variancePct];
      });
      rows.push(['TOTALS', cmp.totalCurrent, cmp.totalPrevious, cmp.totalVariance, cmp.totalVariancePct]);
      Excel.exportWorkbook([{ name: 'Comparative ' + cmpType, header: ['Account', 'Current', 'Previous', 'Variance', 'Variance %'], rows: rows, widths: [34, 14, 14, 14, 12], numberCols: [1, 2, 3] }], 'comparative-' + cmpType + '-' + cmpPeriod + '.xlsx');
    } else if (kind === 'budget') {
      var period = $('budgetPeriod').value;
      var bv = Accounting.getBudgetVariance(period);
      var rows = bv.rows.map(function (r) {
        return [r.account.accountNumber + ' ' + r.account.name, r.budget, r.actual, r.variance, r.favorable ? 'Favorable' : 'Unfavorable'];
      });
      rows.push(['TOTALS', bv.totalBudget, bv.totalActual, bv.totalVariance, '']);
      Excel.exportWorkbook([{ name: 'Budget Variance ' + period, header: ['Account', 'Budget', 'Actual', 'Variance', 'Status'], rows: rows, widths: [36, 14, 14, 14, 12], numberCols: [1, 2, 3] }], 'budget-variance-' + period + '.xlsx');
    }
    Audit.log('report_exported', 'Exported ' + kind + ' report to Excel', { entityType: 'report' });
  };

  Excel.exportAuditExcel = function () {
    if (!global.Permissions || !global.Permissions.can('view_audit_log')) { Utils.toast('Not permitted', 'error'); return; }
    var logs = global.Audit.getLogs({});
    var rows = logs.map(function (l) {
      return [l.timestamp, l.username, l.userRole, l.action, l.details, l.ipAddress, l.browser, l.device, l.location];
    });
    Excel.exportWorkbook([{ name: 'Audit Log', header: ['Timestamp', 'User', 'Role', 'Action', 'Details', 'IP', 'Browser', 'Device', 'Location'], rows: rows, widths: [20, 14, 12, 22, 44, 14, 12, 14, 26] }], 'audit-log-' + Utils.todayStr() + '.xlsx');
  };

  Excel.exportUsersExcel = function () {
    if (!global.Permissions || !global.Permissions.can('manage_users')) { Utils.toast('Not permitted', 'error'); return; }
    var users = global.Auth.allUsers();
    var rows = users.map(function (u) {
      return [u.id, u.username, u.fullName, u.email, u.role, u.status, u.created_at, u.last_login || ''];
    });
    Excel.exportWorkbook([{ name: 'Users', header: ['ID', 'Username', 'Full Name', 'Email', 'Role', 'Status', 'Created', 'Last Login'], rows: rows, widths: [22, 14, 22, 28, 12, 10, 22, 22] }], 'users-' + Utils.todayStr() + '.xlsx');
  };

  /* ---------------- Templates ---------------- */
  Excel.downloadTemplate = function (kind) {
    var tpls = {
      accounts: {
        header: ['Account Number', 'Name', 'Type', 'Parent', 'Normal Balance', 'Status'],
        rows: [['1000', 'Cash', 'Asset', '', 'Debit', 'Active'], ['4000', 'Sales Revenue', 'Revenue', '', 'Credit', 'Active']],
        widths: [16, 26, 12, 12, 14, 10]
      },
      journal: {
        header: ['Date', 'Reference', 'Description', 'Account Number', 'Debit', 'Credit'],
        rows: [['2026-01-01', 'INV-001', 'Cash sale', '1000', 500, ''], ['2026-01-01', 'INV-001', 'Cash sale', '4000', '', 500]],
        widths: [12, 14, 28, 14, 12, 12]
      },
      bank: {
        header: ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
        rows: [['2026-01-01', 'Opening Balance', '', '', 1000], ['2026-01-02', 'Deposit', '', 500, 1500]],
        widths: [12, 30, 12, 12, 12]
      },
      budget: {
        header: ['Account Number', 'Period', 'Amount'],
        rows: [['4000', '2026-01', 8500], ['5200', '2026-01', 1200]],
        widths: [16, 12, 14]
      }
    };
    var t = tpls[kind];
    if (!t) return;
    var instructions = [
      ['INSTRUCTIONS - ' + kind.toUpperCase() + ' TEMPLATE'],
      [''],
      ['1. Do not modify the header row.'],
      ['2. Fill in your data below the example rows.'],
      ['3. Account Number must exist in your Chart of Accounts (journal/budget/bank imports).'],
      ['4. Date format: YYYY-MM-DD.'],
      ['5. Amounts are numbers only (no currency symbols or commas).'],
      ['6. For journal entries, each entry is grouped by Date + Reference + Description.'],
      ['7. Debits must equal credits for each group.'],
      ['8. Type must be one of: Asset, Liability, Equity, Revenue, Expense (accounts).'],
      ['9. Save as .xlsx or .csv and import via the Import / Export page.']
    ];
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([t.header].concat(t.rows));
    ws['!cols'] = t.widths.map(function (w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    var ws2 = XLSX.utils.aoa_to_sheet(instructions);
    ws2['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');
    XLSX.writeFile(wb, kind + '-template.xlsx');
  };

  /* ---------------- Excel import ---------------- */
  Excel.importExcelFile = function (file, type) {
    return Utils.fileToArrayBuffer(file).then(function (buf) {
      if (typeof XLSX === 'undefined') { throw new Error('SheetJS library not loaded'); }
      var wb = XLSX.read(buf, { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      aoa = aoa.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
      if (aoa.length < 2) return { ok: false, error: 'File has no data rows' };
      var headers = aoa[0].map(function (h) { return String(h).trim(); });
      var objects = CSV.rowsToObjects(headers, aoa.slice(1));
      return CSV.processImport(type, objects, { preview: true, source: file.name });
    });
  };

  global.Excel = Excel;
})(typeof window !== 'undefined' ? window : globalThis);
