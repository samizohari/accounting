/* ============================================================
 * accounting.js — Double-entry accounting engine (pure logic)
 * Accounts, journal entries, ledger, trial balance, financial
 * statements, budget, reconciliation, recurring entries,
 * integrity checks, backup/restore, sample data.
 * Namespace: window.Accounting
 * ============================================================ */
(function (global) {
  'use strict';
  var Accounting = {};
  var Utils = global.Utils;
  var Audit = global.Audit;
  var K = Utils.K;

  /* ---------------- helpers ---------------- */
  Accounting.uid = function () {
    var u = global.Auth && global.Auth.getCurrentUser();
    return u ? u.id : 'system';
  };
  Accounting.dayBefore = function (dateStr) {
    var d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  Accounting.periodEnd = function (period) {
    var y = parseInt(period.slice(0, 4), 10), m = parseInt(period.slice(5, 7), 10);
    return new Date(y, m, 0).toISOString().slice(0, 10);
  };
  Accounting.fiscalStart = function (asOf) {
    var s = Utils.getSettings().fiscal_year_start || 'January';
    var ref = asOf ? new Date(asOf + 'T00:00:00') : new Date();
    var y = ref.getFullYear();
    var monthMap = { January: 0, April: 3, July: 6, October: 9 };
    var m = monthMap[s] !== undefined ? monthMap[s] : 0;
    var start = new Date(y, m, 1);
    if (start > ref) start = new Date(y - 1, m, 1);
    return start.toISOString().slice(0, 10);
  };

  /* ================= ACCOUNTS ================= */
  Accounting.getAccounts = function (userId) {
    var uid = userId || Accounting.uid();
    return Utils.loadData(K.ACCOUNTS, []).filter(function (a) { return a.userId === uid; });
  };
  Accounting.getAccount = function (id) {
    return Utils.loadData(K.ACCOUNTS, []).find(function (a) { return a.id === id; }) || null;
  };
  Accounting.byNumber = function (num) {
    return Accounting.getAccounts().find(function (a) { return a.accountNumber === String(num); }) || null;
  };
  Accounting.getAccountChildren = function (id) {
    return Utils.loadData(K.ACCOUNTS, []).filter(function (a) { return a.parentId === id; });
  };

  Accounting.nextAccountNumber = function (type) {
    var prefix = { Asset: 1, Liability: 2, Equity: 3, Revenue: 4, Expense: 5 }[type] || 1;
    var max = 0;
    Accounting.getAccounts().forEach(function (a) {
      if (a.type === type && /^\d+$/.test(a.accountNumber)) {
        var n = parseInt(a.accountNumber, 10);
        if (n > max) max = n;
      }
    });
    return max >= prefix * 1000 ? String(max + 10) : String(prefix * 1000);
  };

  Accounting.createAccount = function (data) {
    var user = global.Auth && global.Auth.getCurrentUser();
    if (!user) return { ok: false, error: 'Not logged in' };
    var acc = {
      id: 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      userId: user.id,
      accountNumber: String(data.accountNumber || '').trim(),
      name: String(data.name || '').trim(),
      type: data.type || 'Asset',
      parentId: data.parentId || null,
      normalBalance: data.normalBalance || (data.type === 'Asset' || data.type === 'Expense' ? 'Debit' : 'Credit'),
      status: data.status || 'active',
      created_at: Utils.nowISO(),
      updated_at: Utils.nowISO()
    };
    if (!acc.accountNumber || !acc.name) return { ok: false, error: 'Account number and name are required' };
    if (Utils.loadData(K.ACCOUNTS, []).some(function (a) { return a.userId === user.id && a.accountNumber === acc.accountNumber; })) {
      return { ok: false, error: 'Account number ' + acc.accountNumber + ' already exists' };
    }
    if (acc.parentId && !Accounting.getAccount(acc.parentId)) return { ok: false, error: 'Parent account not found' };
    var all = Utils.loadData(K.ACCOUNTS, []);
    all.push(acc);
    Utils.saveData(K.ACCOUNTS, all);
    Audit.log('account_created', 'Created account ' + acc.accountNumber + ' ' + acc.name + ' (' + acc.type + ')', { entityType: 'account', entityId: acc.id });
    return { ok: true, account: acc };
  };

  Accounting.updateAccount = function (id, data) {
    var all = Utils.loadData(K.ACCOUNTS, []);
    var i = all.findIndex(function (a) { return a.id === id; });
    if (i < 0) return { ok: false, error: 'Account not found' };
    var acc = all[i];
    if (data.accountNumber !== undefined && String(data.accountNumber).trim() !== acc.accountNumber) {
      if (all.some(function (a) { return a.userId === acc.userId && a.accountNumber === String(data.accountNumber).trim() && a.id !== id; })) {
        return { ok: false, error: 'Account number already exists' };
      }
    }
    if (data.parentId === id) return { ok: false, error: 'Account cannot be its own parent' };
    acc.accountNumber = String(data.accountNumber || acc.accountNumber).trim();
    acc.name = String(data.name || acc.name).trim();
    acc.type = data.type || acc.type;
    acc.parentId = data.parentId !== undefined ? data.parentId : acc.parentId;
    acc.normalBalance = data.normalBalance || acc.normalBalance;
    acc.status = data.status || acc.status;
    acc.updated_at = Utils.nowISO();
    all[i] = acc;
    Utils.saveData(K.ACCOUNTS, all);
    Audit.log('account_updated', 'Updated account ' + acc.accountNumber + ' ' + acc.name, { entityType: 'account', entityId: acc.id });
    return { ok: true, account: acc };
  };

  Accounting.deleteAccount = function (id, force) {
    var acc = Accounting.getAccount(id);
    if (!acc) return { ok: false, error: 'Account not found' };
    var all = Utils.loadData(K.ACCOUNTS, []);
    var children = all.filter(function (a) { return a.parentId === id; });
    var lines = Utils.loadData(K.LINES, []).filter(function (l) { return l.accountId === id; });
    if (children.length && !force) return { ok: false, error: 'Account has ' + children.length + ' child account(s). Delete or move them first.' };
    if (lines.length && !force) return { ok: false, error: 'Account has ' + lines.length + ' transaction line(s). Admin can force-delete.' };
    if (lines.length && force && !(global.Permissions && global.Permissions.can('delete_any_transaction'))) {
      return { ok: false, error: 'Only admins can force-delete accounts with transactions' };
    }
    Utils.saveData(K.ACCOUNTS, all.filter(function (a) { return a.id !== id && (force || a.parentId !== id); }));
    if (force) {
      Utils.saveData(K.LINES, Utils.loadData(K.LINES, []).filter(function (l) { return l.accountId !== id; }));
    }
    Audit.log('account_deleted', 'Deleted account ' + acc.accountNumber + ' ' + acc.name + (force ? ' (forced, with transactions)' : ''), { entityType: 'account', entityId: id });
    return { ok: true };
  };

  /* ================= JOURNAL ENTRIES ================= */
  Accounting.getEntries = function (userId) {
    var uid = userId || Accounting.uid();
    return Utils.loadData(K.ENTRIES, []).filter(function (e) { return e.userId === uid; });
  };
  Accounting.getEntry = function (id) {
    return Utils.loadData(K.ENTRIES, []).find(function (e) { return e.id === id; }) || null;
  };
  Accounting.entryLines = function (entryId) {
    return Utils.loadData(K.LINES, []).filter(function (l) { return l.entryId === entryId; });
  };
  Accounting.entryTotals = function (lines) {
    var d = 0, c = 0;
    (lines || []).forEach(function (l) {
      d += Utils.parseMoney(l.debit);
      c += Utils.parseMoney(l.credit);
    });
    return { debit: d, credit: c };
  };
  Accounting.entryBalanced = function (lines) {
    var t = Accounting.entryTotals(lines);
    return Math.abs(t.debit - t.credit) < 0.005 && (t.debit > 0 || t.credit > 0);
  };

  Accounting.createEntry = function (data) {
    var user = global.Auth && global.Auth.getCurrentUser();
    if (!user) return { ok: false, error: 'Not logged in' };
    var lines = (data.lines || []).filter(function (l) {
      return l.accountId && (Utils.parseMoney(l.debit) > 0 || Utils.parseMoney(l.credit) > 0);
    });
    if (!lines.length) return { ok: false, error: 'Entry must have at least one line with a debit or credit' };
    if (!Accounting.entryBalanced(lines)) return { ok: false, error: 'Entry is not balanced. Total debits must equal total credits.' };
    var entry = {
      id: 'entry_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      userId: user.id,
      date: data.date || Utils.todayStr(),
      description: String(data.description || '').trim(),
      reference: String(data.reference || '').trim(),
      recurringId: null,
      status: data.status || 'active',
      created_by: user.id,
      created_at: Utils.nowISO(),
      approved_by: data.approved ? user.id : null,
      approved_at: data.approved ? Utils.nowISO() : null,
      notes: String(data.notes || '').trim()
    };
    var entries = Utils.loadData(K.ENTRIES, []);
    entries.push(entry);
    Utils.saveData(K.ENTRIES, entries);
    var allLines = Utils.loadData(K.LINES, []);
    lines.forEach(function (l) {
      allLines.push({
        id: 'line_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        entryId: entry.id,
        accountId: l.accountId,
        debit: Utils.parseMoney(l.debit),
        credit: Utils.parseMoney(l.credit),
        description: String(l.description || '').trim()
      });
    });
    Utils.saveData(K.LINES, allLines);
    var t = Accounting.entryTotals(lines);
    Audit.log('journal_entry_created', 'Created journal entry ' + (entry.reference || entry.id) + ' for ' + Utils.fmtMoney(Math.max(t.debit, t.credit)), { entityType: 'journal_entry', entityId: entry.id });
    if (data.recurring && data.recurring !== 'none') Accounting.createRecurringFromEntry(entry, data.recurring);
    return { ok: true, entry: entry };
  };

  Accounting.updateEntry = function (id, data) {
    var entries = Utils.loadData(K.ENTRIES, []);
    var i = entries.findIndex(function (e) { return e.id === id; });
    if (i < 0) return { ok: false, error: 'Entry not found' };
    var lines = (data.lines || []).filter(function (l) {
      return l.accountId && (Utils.parseMoney(l.debit) > 0 || Utils.parseMoney(l.credit) > 0);
    });
    if (!lines.length) return { ok: false, error: 'Entry must have at least one line' };
    if (!Accounting.entryBalanced(lines)) return { ok: false, error: 'Entry is not balanced. Total debits must equal total credits.' };
    var entry = entries[i];
    entry.date = data.date || entry.date;
    entry.description = String(data.description || '').trim();
    entry.reference = String(data.reference || '').trim();
    entry.notes = String(data.notes || '').trim();
    entry.status = data.status || entry.status;
    entries[i] = entry;
    Utils.saveData(K.ENTRIES, entries);
    var allLines = Utils.loadData(K.LINES, []).filter(function (l) { return l.entryId !== id; });
    lines.forEach(function (l) {
      allLines.push({
        id: 'line_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        entryId: id,
        accountId: l.accountId,
        debit: Utils.parseMoney(l.debit),
        credit: Utils.parseMoney(l.credit),
        description: String(l.description || '').trim()
      });
    });
    Utils.saveData(K.LINES, allLines);
    Audit.log('journal_entry_updated', 'Updated journal entry ' + (entry.reference || entry.id), { entityType: 'journal_entry', entityId: id });
    return { ok: true, entry: entry };
  };

  Accounting.deleteEntry = function (id, force) {
    var entry = Accounting.getEntry(id);
    if (!entry) return { ok: false, error: 'Entry not found' };
    Utils.saveData(K.ENTRIES, Utils.loadData(K.ENTRIES, []).filter(function (e) { return e.id !== id; }));
    Utils.saveData(K.LINES, Utils.loadData(K.LINES, []).filter(function (l) { return l.entryId !== id; }));
    Audit.log('journal_entry_deleted', 'Deleted journal entry ' + (entry.reference || entry.id), { entityType: 'journal_entry', entityId: id });
    return { ok: true };
  };

  Accounting.reverseEntry = function (id) {
    var entry = Accounting.getEntry(id);
    if (!entry) return { ok: false, error: 'Entry not found' };
    var lines = Accounting.entryLines(id).map(function (l) {
      return { accountId: l.accountId, debit: l.credit, credit: l.debit, description: l.description };
    });
    var res = Accounting.createEntry({
      date: Utils.todayStr(),
      description: 'REVERSAL of ' + (entry.reference || entry.id) + ' — ' + entry.description,
      reference: (entry.reference || entry.id) + '-REV',
      notes: 'Reverses entry ' + entry.id,
      status: 'active',
      lines: lines
    });
    if (res.ok) {
      Audit.log('journal_entry_reversed', 'Reversed journal entry ' + (entry.reference || entry.id) + ' with reversal ' + (res.entry.reference || res.entry.id), { entityType: 'journal_entry', entityId: res.entry.id });
    }
    return res;
  };

  Accounting.approveEntry = function (id) {
    var user = global.Auth && global.Auth.getCurrentUser();
    var entries = Utils.loadData(K.ENTRIES, []);
    var i = entries.findIndex(function (e) { return e.id === id; });
    if (i < 0) return { ok: false, error: 'Entry not found' };
    entries[i].approved_by = user ? user.id : null;
    entries[i].approved_at = Utils.nowISO();
    entries[i].status = 'approved';
    Utils.saveData(K.ENTRIES, entries);
    Audit.log('journal_entry_approved', 'Approved journal entry ' + (entries[i].reference || id), { entityType: 'journal_entry', entityId: id });
    return { ok: true };
  };

  Accounting.rejectEntry = function (id) {
    var entries = Utils.loadData(K.ENTRIES, []);
    var i = entries.findIndex(function (e) { return e.id === id; });
    if (i < 0) return { ok: false, error: 'Entry not found' };
    entries[i].status = 'rejected';
    entries[i].approved_by = null;
    entries[i].approved_at = null;
    Utils.saveData(K.ENTRIES, entries);
    Audit.log('journal_entry_rejected', 'Rejected journal entry ' + (entries[i].reference || id), { entityType: 'journal_entry', entityId: id });
    return { ok: true };
  };

  /* ================= BALANCES & LEDGER ================= */
  // Balance of a single account (raw debit/credit/net). Drafts & rejected entries are excluded.
  Accounting.accountBalance = function (accountId, opts) {
    opts = opts || {};
    var lines = Utils.loadData(K.LINES, []).filter(function (l) { return l.accountId === accountId; });
    var entries = Utils.loadData(K.ENTRIES, []);
    var byId = {};
    entries.forEach(function (e) { byId[e.id] = e; });
    var debit = 0, credit = 0;
    lines.forEach(function (l) {
      var e = byId[l.entryId];
      if (!e || e.status === 'draft' || e.status === 'rejected') return;
      if (opts.from && e.date < opts.from) return;
      if (opts.to && e.date > opts.to) return;
      if (opts.asOf && e.date > opts.asOf) return;
      debit += Utils.parseMoney(l.debit);
      credit += Utils.parseMoney(l.credit);
    });
    return { debit: debit, credit: credit, net: debit - credit };
  };

  Accounting.getLedger = function (accountId, opts) {
    opts = opts || {};
    var lines = Utils.loadData(K.LINES, []).filter(function (l) { return l.accountId === accountId; });
    var entries = Utils.loadData(K.ENTRIES, []);
    var byId = {};
    entries.forEach(function (e) { byId[e.id] = e; });
    var rows = [], opening = 0, totalDebit = 0, totalCredit = 0;
    lines.forEach(function (l) {
      var e = byId[l.entryId];
      if (!e || e.status === 'draft' || e.status === 'rejected') return;
      if (opts.from && e.date < opts.from) {
        opening += Utils.parseMoney(l.debit) - Utils.parseMoney(l.credit);
        return;
      }
      if (opts.to && e.date > opts.to) return;
      totalDebit += Utils.parseMoney(l.debit);
      totalCredit += Utils.parseMoney(l.credit);
      rows.push({
        date: e.date, reference: e.reference, entryId: e.id,
        description: l.description || e.description,
        debit: Utils.parseMoney(l.debit), credit: Utils.parseMoney(l.credit),
        status: e.status
      });
    });
    rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var running = opening;
    rows.forEach(function (r) { running += r.debit - r.credit; r.balance = running; });
    return { rows: rows, openingBalance: opening, endingBalance: running, totalDebit: totalDebit, totalCredit: totalCredit };
  };

  /* ================= TRIAL BALANCE ================= */
  Accounting.getTrialBalance = function (opts) {
    opts = opts || {};
    var accounts = Accounting.getAccounts().filter(function (a) { return a.status === 'active'; });
    var rows = [], totalDebit = 0, totalCredit = 0;
    accounts.forEach(function (acc) {
      var b = Accounting.accountBalance(acc.id, { asOf: opts.asOf || undefined, from: opts.from, to: opts.to });
      if (b.debit === 0 && b.credit === 0) return;
      rows.push({ account: acc, debit: b.debit, credit: b.credit });
    });
    if (opts.type === 'postClosing') {
      var netIncome = 0, kept = [];
      rows.forEach(function (r) {
        if (r.account.type === 'Revenue') netIncome += r.credit - r.debit;
        else if (r.account.type === 'Expense') netIncome -= r.debit - r.credit;
        else kept.push(r);
      });
      rows = kept;
      if (Math.abs(netIncome) > 0.004) {
        var re = accounts.find(function (a) { return a.type === 'Equity' && /retained/i.test(a.name); });
        if (re) {
          var ex = rows.find(function (r) { return r.account.id === re.id; });
          if (ex) { if (netIncome >= 0) ex.credit += netIncome; else ex.debit += -netIncome; }
          else rows.push({ account: re, debit: netIncome < 0 ? -netIncome : 0, credit: netIncome > 0 ? netIncome : 0 });
        } else {
          rows.push({ synthetic: true, label: 'Retained Earnings (closing)', debit: netIncome < 0 ? -netIncome : 0, credit: netIncome > 0 ? netIncome : 0 });
        }
      }
    }
    rows.forEach(function (r) {
      totalDebit += r.debit || 0;
      totalCredit += r.credit || 0;
    });
    rows.sort(function (a, b) {
      var an = a.account ? a.account.accountNumber : 'ZZZ';
      var bn = b.account ? b.account.accountNumber : 'ZZZ';
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    var diff = totalDebit - totalCredit;
    return { rows: rows, totalDebit: totalDebit, totalCredit: totalCredit, diff: diff, balanced: Math.abs(diff) < 0.005 };
  };

  /* ================= FINANCIAL STATEMENTS ================= */
  Accounting.getPnl = function (from, to) {
    var accounts = Accounting.getAccounts();
    var revenue = [], expenses = [], totalRevenue = 0, totalExpenses = 0;
    accounts.forEach(function (acc) {
      var b = Accounting.accountBalance(acc.id, { from: from, to: to });
      if (acc.type === 'Revenue') {
        var amt = b.credit - b.debit;
        if (Math.abs(amt) > 0.004) { revenue.push({ account: acc, amount: amt }); totalRevenue += amt; }
      } else if (acc.type === 'Expense') {
        var amt2 = b.debit - b.credit;
        if (Math.abs(amt2) > 0.004) { expenses.push({ account: acc, amount: amt2 }); totalExpenses += amt2; }
      }
    });
    return { revenue: revenue, expenses: expenses, totalRevenue: totalRevenue, totalExpenses: totalExpenses, netIncome: totalRevenue - totalExpenses };
  };

  Accounting.getBalanceSheet = function (asOf) {
    var accounts = Accounting.getAccounts();
    var assets = [], liabilities = [], equity = [];
    accounts.forEach(function (acc) {
      var b = Accounting.accountBalance(acc.id, { asOf: asOf });
      var amt;
      if (acc.type === 'Asset') { amt = b.debit - b.credit; if (Math.abs(amt) > 0.004) assets.push({ account: acc, amount: amt }); }
      else if (acc.type === 'Liability') { amt = b.credit - b.debit; if (Math.abs(amt) > 0.004) liabilities.push({ account: acc, amount: amt }); }
      else if (acc.type === 'Equity') { amt = b.credit - b.debit; if (Math.abs(amt) > 0.004) equity.push({ account: acc, amount: amt }); }
    });
    var pnl = Accounting.getPnl(Accounting.fiscalStart(asOf), asOf);
    var equityRows = equity.slice();
    if (Math.abs(pnl.netIncome) > 0.004) {
      equityRows.push({ synthetic: true, label: 'Current Net Income', amount: pnl.netIncome });
    }
    var sum = function (arr) { return arr.reduce(function (s, r) { return s + (r.amount || 0); }, 0); };
    var totalAssets = sum(assets), totalLiabilities = sum(liabilities), totalEquity = sum(equityRows);
    var difference = totalAssets - totalLiabilities - totalEquity;
    return {
      assets: assets, liabilities: liabilities, equity: equityRows,
      totalAssets: totalAssets, totalLiabilities: totalLiabilities, totalEquity: totalEquity,
      balanced: Math.abs(difference) < 0.05, difference: difference
    };
  };

  Accounting.isCurrent = function (acc) {
    if (acc.type === 'Asset') return /(cash|bank|receivable|inventory|prepaid|supplies)/i.test(acc.name);
    if (acc.type === 'Liability') return /(payable|accrued|tax|short|current)/i.test(acc.name);
    return false;
  };

  Accounting.getCashFlow = function (from, to, method) {
    var accounts = Accounting.getAccounts();
    var dayBeforeFrom = Accounting.dayBefore(from);
    var cashAccounts = accounts.filter(function (a) { return a.type === 'Asset' && /(cash|bank)/i.test(a.name); });
    var cashStart = 0, cashEnd = 0;
    cashAccounts.forEach(function (a) {
      cashStart += Accounting.accountBalance(a.id, { to: dayBeforeFrom }).net;
      cashEnd += Accounting.accountBalance(a.id, { to: to }).net;
    });
    var pnl = Accounting.getPnl(from, to);
    var operating = [], investing = [], financing = [];
    var operatingTotal = 0, investTotal = 0, financeTotal = 0;

    if (method === 'indirect') {
      var deltaCurAssets = 0, deltaCurLiab = 0;
      accounts.forEach(function (a) {
        if (a.type !== 'Asset' && a.type !== 'Liability') return;
        var d = Accounting.accountBalance(a.id, { to: to }).net - Accounting.accountBalance(a.id, { to: dayBeforeFrom }).net;
        if (Accounting.isCurrent(a)) {
          if (a.type === 'Asset') deltaCurAssets += d; else deltaCurLiab += d;
        } else {
          if (a.type === 'Asset') { investing.push({ account: a, amount: -d }); }
          else { financing.push({ account: a, amount: d }); }
        }
      });
      operating.push({ label: 'Net Income', amount: pnl.netIncome });
      operating.push({ label: 'Increase/Decrease in Current Assets', amount: -deltaCurAssets });
      operating.push({ label: 'Increase/Decrease in Current Liabilities', amount: deltaCurLiab });
      operatingTotal = pnl.netIncome - deltaCurAssets + deltaCurLiab;
    } else {
      var rev = 0, exp = 0;
      pnl.revenue.forEach(function (r) { rev += r.amount; });
      pnl.expenses.forEach(function (e) { exp += e.amount; });
      operating.push({ label: 'Cash received from customers', amount: rev });
      operating.push({ label: 'Cash paid for operating expenses', amount: -exp });
      operatingTotal = rev - exp;
      accounts.forEach(function (a) {
        if (a.type === 'Asset' && !Accounting.isCurrent(a)) {
          var d = Accounting.accountBalance(a.id, { to: to }).net - Accounting.accountBalance(a.id, { to: dayBeforeFrom }).net;
          investing.push({ account: a, amount: -d });
        }
      });
      accounts.forEach(function (a) {
        if (a.type === 'Liability' && !Accounting.isCurrent(a)) {
          var d = Accounting.accountBalance(a.id, { to: to }).net - Accounting.accountBalance(a.id, { to: dayBeforeFrom }).net;
          financing.push({ account: a, amount: d });
        } else if (a.type === 'Equity') {
          var d2 = Accounting.accountBalance(a.id, { to: to }).net - Accounting.accountBalance(a.id, { to: dayBeforeFrom }).net;
          financing.push({ account: a, amount: d2 });
        }
      });
    }
    investTotal = investing.reduce(function (s, r) { return s + (r.amount || 0); }, 0);
    financeTotal = financing.reduce(function (s, r) { return s + (r.amount || 0); }, 0);
    var netFlow = operatingTotal + investTotal + financeTotal;
    return {
      operating: operating, investing: investing, financing: financing,
      operatingTotal: operatingTotal, investTotal: investTotal, financeTotal: financeTotal,
      netFlow: netFlow, cashStart: cashStart, cashEnd: cashEnd, check: Math.abs(cashEnd - (cashStart + netFlow)) < 0.05
    };
  };

  Accounting.getRetainedEarnings = function (from, to) {
    var accounts = Accounting.getAccounts();
    var re = accounts.find(function (a) { return a.type === 'Equity' && /retained/i.test(a.name); });
    var beginning = re ? Accounting.accountBalance(re.id, { to: Accounting.dayBefore(from) }).net : 0;
    var pnl = Accounting.getPnl(from, to);
    return {
      account: re, beginning: beginning, netIncome: pnl.netIncome,
      ending: beginning + pnl.netIncome
    };
  };

  /* ================= BUDGET ================= */
  Accounting.getBudget = function (period) {
    var uid = Accounting.uid();
    return Utils.loadData(K.BUDGET, []).filter(function (b) { return b.userId === uid && (!period || b.period === period); });
  };
  Accounting.setBudget = function (accountId, period, amount) {
    var uid = Accounting.uid();
    var budget = Utils.loadData(K.BUDGET, []);
    var existing = budget.find(function (b) { return b.userId === uid && b.accountId === accountId && b.period === period; });
    if (existing) existing.amount = Utils.parseMoney(amount);
    else budget.push({ id: 'bgt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), userId: uid, accountId: accountId, period: period, amount: Utils.parseMoney(amount) });
    Utils.saveData(K.BUDGET, budget);
    Audit.log('budget_updated', 'Budget set for account ' + accountId + ' in period ' + period, { entityType: 'budget', entityId: accountId });
    return { ok: true };
  };
  Accounting.deleteBudgetItem = function (accountId, period) {
    var uid = Accounting.uid();
    Utils.saveData(K.BUDGET, Utils.loadData(K.BUDGET, []).filter(function (b) { return !(b.userId === uid && b.accountId === accountId && b.period === period); }));
  };
  Accounting.getBudgetVariance = function (period) {
    var accounts = Accounting.getAccounts();
    var budgetItems = Accounting.getBudget(period);
    var rows = [];
    var totalBudget = 0, totalActual = 0;
    accounts.forEach(function (acc) {
      if (acc.type !== 'Revenue' && acc.type !== 'Expense') return;
      var bi = budgetItems.find(function (b) { return b.accountId === acc.id; });
      var b = Accounting.accountBalance(acc.id, { from: period + '-01', to: Accounting.periodEnd(period) });
      var actual = acc.type === 'Revenue' ? b.credit - b.debit : b.debit - b.credit;
      var budget = bi ? bi.amount : 0;
      if (!bi && Math.abs(actual) < 0.004) return;
      var variance = actual - budget;
      var favorable = acc.type === 'Revenue' ? variance > 0 : variance < 0;
      rows.push({ account: acc, budget: budget, actual: actual, variance: variance, favorable: favorable, hasBudget: !!bi });
      totalBudget += budget;
      totalActual += actual;
    });
    rows.sort(function (a, b) {
      if (a.account.type !== b.account.type) return a.account.type < b.account.type ? -1 : 1;
      return a.account.accountNumber < b.account.accountNumber ? -1 : 1;
    });
    return { rows: rows, totalBudget: totalBudget, totalActual: totalActual, totalVariance: totalActual - totalBudget };
  };

  /* ================= RECONCILIATION ================= */
  Accounting.getReconciled = function () {
    var uid = Accounting.uid();
    return Utils.loadData(K.RECON, []).filter(function (r) { return r.userId === uid; });
  };
  Accounting.isReconciled = function (entryId) {
    var uid = Accounting.uid();
    return Utils.loadData(K.RECON, []).some(function (r) { return r.userId === uid && r.entryId === entryId; });
  };
  Accounting.markReconciled = function (entryIds) {
    var uid = Accounting.uid();
    var recon = Utils.loadData(K.RECON, []);
    entryIds.forEach(function (eid) {
      if (!recon.some(function (r) { return r.userId === uid && r.entryId === eid; })) {
        recon.push({ id: 'rec_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), userId: uid, entryId: eid, reconciledAt: Utils.nowISO() });
      }
    });
    Utils.saveData(K.RECON, recon);
    Audit.log('reconciliation_updated', 'Marked ' + entryIds.length + ' entries as reconciled', { entityType: 'reconciliation' });
    return { ok: true };
  };
  Accounting.unmarkReconciled = function (entryId) {
    var uid = Accounting.uid();
    Utils.saveData(K.RECON, Utils.loadData(K.RECON, []).filter(function (r) { return !(r.userId === uid && r.entryId === entryId); }));
  };

  /* ================= RECURRING ENTRIES ================= */
  Accounting.nextRecurringDate = function (dateStr, frequency) {
    var d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    if (frequency === 'daily') d.setDate(d.getDate() + 1);
    else if (frequency === 'weekly') d.setDate(d.getDate() + 7);
    else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  };
  Accounting.createRecurringFromEntry = function (entry, frequency) {
    var uid = Accounting.uid();
    var tpl = {
      id: 'rtpl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: uid,
      frequency: frequency,
      nextDate: Accounting.nextRecurringDate(entry.date, frequency),
      description: entry.description,
      reference: entry.reference,
      notes: entry.notes,
      status: 'active',
      lines: Accounting.entryLines(entry.id).map(function (l) {
        return { accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description };
      })
    };
    var rec = Utils.loadData(K.RECURRING, []);
    rec.push(tpl);
    Utils.saveData(K.RECURRING, rec);
    return tpl;
  };
  Accounting.runDueRecurring = function () {
    var uid = Accounting.uid();
    var rec = Utils.loadData(K.RECURRING, []).filter(function (r) { return r.userId === uid && r.status === 'active'; });
    var today = Utils.todayStr();
    var created = 0, changed = false;
    rec.forEach(function (tpl) {
      while (tpl.nextDate <= today) {
        Accounting.createEntry({
          date: tpl.nextDate,
          description: tpl.description,
          reference: (tpl.reference || 'REC') + '-R',
          notes: tpl.notes,
          status: 'active',
          lines: tpl.lines
        });
        tpl.nextDate = Accounting.nextRecurringDate(tpl.nextDate, tpl.frequency);
        created++;
        changed = true;
      }
    });
    if (changed) Utils.saveData(K.RECURRING, Utils.loadData(K.RECURRING, []));
    return created;
  };

  /* ================= INTEGRITY & MAINTENANCE ================= */
  Accounting.integrityCheck = function () {
    var issues = [];
    var entries = Utils.loadData(K.ENTRIES, []);
    var lines = Utils.loadData(K.LINES, []);
    var accounts = Utils.loadData(K.ACCOUNTS, []);
    var users = Utils.loadData(K.USERS, []);
    var userIds = {}, entryIds = {}, accIds = {};
    users.forEach(function (u) { userIds[u.id] = true; });
    entries.forEach(function (e) { entryIds[e.id] = true; });
    accounts.forEach(function (a) { accIds[a.id] = true; });
    entries.forEach(function (e) {
      if (!userIds[e.userId]) issues.push({ severity: 'warn', type: 'orphan', detail: 'Entry ' + e.id + ' references missing user ' + e.userId });
      var el = lines.filter(function (l) { return l.entryId === e.id; });
      if (!el.length) issues.push({ severity: 'error', type: 'orphan', detail: 'Entry ' + (e.reference || e.id) + ' has no lines' });
      var t = Accounting.entryTotals(el);
      if (el.length && Math.abs(t.debit - t.credit) > 0.005) issues.push({ severity: 'error', type: 'unbalanced', detail: 'Entry ' + (e.reference || e.id) + ' is unbalanced' });
    });
    lines.forEach(function (l) {
      if (!entryIds[l.entryId]) issues.push({ severity: 'error', type: 'orphan', detail: 'Line ' + l.id + ' references missing entry ' + l.entryId });
      if (!accIds[l.accountId]) issues.push({ severity: 'error', type: 'orphan', detail: 'Line ' + l.id + ' references missing account ' + l.accountId });
      if (Utils.parseMoney(l.debit) > 0 && Utils.parseMoney(l.credit) > 0) issues.push({ severity: 'warn', type: 'invalid', detail: 'Line ' + l.id + ' has both debit and credit' });
      if (Utils.parseMoney(l.debit) < 0 || Utils.parseMoney(l.credit) < 0) issues.push({ severity: 'warn', type: 'invalid', detail: 'Line ' + l.id + ' has negative amount' });
    });
    accounts.forEach(function (a) {
      if (a.parentId && !accIds[a.parentId]) issues.push({ severity: 'warn', type: 'orphan', detail: 'Account ' + a.accountNumber + ' references missing parent account' });
    });
    var seen = {};
    entries.forEach(function (e) {
      var key = e.date + '|' + (e.reference || '') + '|' + e.description;
      if (seen[key]) issues.push({ severity: 'warn', type: 'duplicate', detail: 'Possible duplicate entry: ' + e.date + ' ' + e.reference + ' ' + e.description });
      seen[key] = true;
    });
    return issues;
  };
  Accounting.cleanupOrphans = function () {
    var issues = Accounting.integrityCheck();
    var remove = {};
    issues.forEach(function (i) {
      var m = /^Line (\S+) references missing entry/.exec(i.detail) || /^Line (\S+) references missing account/.exec(i.detail);
      if (m) remove[m[1]] = true;
    });
    var ids = Object.keys(remove);
    if (ids.length) {
      Utils.saveData(K.LINES, Utils.loadData(K.LINES, []).filter(function (l) { return !remove[l.id]; }));
    }
    Audit.log('orphan_cleanup', 'Removed ' + ids.length + ' orphan line record(s)', { entityType: 'system' });
    return ids.length;
  };

  /* ================= BACKUP / RESTORE ================= */
  Accounting.getAllData = function () {
    return {
      version: 1,
      app: 'AccountingSystem',
      exportedAt: Utils.nowISO(),
      users: Utils.loadData(K.USERS, []),
      accounts: Utils.loadData(K.ACCOUNTS, []),
      entries: Utils.loadData(K.ENTRIES, []),
      lines: Utils.loadData(K.LINES, []),
      audit: Utils.loadData(K.AUDIT, []),
      auditArchive: Utils.loadData(K.AUDIT_ARCHIVE, []),
      settings: Utils.loadData(K.SETTINGS, {}),
      budget: Utils.loadData(K.BUDGET, []),
      recon: Utils.loadData(K.RECON, []),
      recurring: Utils.loadData(K.RECURRING, []),
      loginHistory: Utils.loadData(K.LOGIN_HISTORY, []),
      meta: Utils.loadData(K.META, {})
    };
  };
  Accounting.restoreAllData = function (json) {
    if (!json || typeof json !== 'object') return { ok: false, error: 'Invalid backup file' };
    if (json.app !== 'AccountingSystem') return { ok: false, error: 'Not an Accounting System backup file' };
    Utils.saveData(K.USERS, json.users || []);
    Utils.saveData(K.ACCOUNTS, json.accounts || []);
    Utils.saveData(K.ENTRIES, json.entries || []);
    Utils.saveData(K.LINES, json.lines || []);
    Utils.saveData(K.AUDIT, json.audit || []);
    Utils.saveData(K.AUDIT_ARCHIVE, json.auditArchive || []);
    Utils.saveData(K.SETTINGS, json.settings || {});
    Utils.saveData(K.BUDGET, json.budget || []);
    Utils.saveData(K.RECON, json.recon || []);
    Utils.saveData(K.RECURRING, json.recurring || []);
    Utils.saveData(K.LOGIN_HISTORY, json.loginHistory || []);
    Utils.saveData(K.META, Object.assign({ seeded: true }, json.meta || {}));
    Audit.log('data_restored', 'System data restored from backup (exported ' + json.exportedAt + ')');
    return { ok: true, counts: { users: json.users ? json.users.length : 0, accounts: json.accounts ? json.accounts.length : 0, entries: json.entries ? json.entries.length : 0 } };
  };

  /* ================= SAMPLE DATA ================= */
  Accounting.loadSampleData = function () {
    var user = global.Auth && global.Auth.getCurrentUser();
    if (!user) return { ok: false, error: 'Not logged in' };
    if (Accounting.getAccounts().length) {
      return { ok: false, error: 'Chart of accounts already exists for this user. Sample data is only loaded into an empty account set.' };
    }
    var defs = [
      ['1000', 'Cash', 'Asset', 'Debit'], ['1010', 'Bank Account', 'Asset', 'Debit'],
      ['1100', 'Accounts Receivable', 'Asset', 'Debit'], ['1200', 'Inventory', 'Asset', 'Debit'],
      ['1300', 'Prepaid Expenses', 'Asset', 'Debit'], ['1500', 'Equipment', 'Asset', 'Debit'],
      ['1600', 'Accumulated Depreciation', 'Asset', 'Credit'],
      ['2000', 'Accounts Payable', 'Liability', 'Credit'], ['2100', 'Accrued Expenses', 'Liability', 'Credit'],
      ['2200', 'Short-term Loan', 'Liability', 'Credit'],
      ['3000', 'Owner Equity', 'Equity', 'Credit'], ['3100', 'Retained Earnings', 'Equity', 'Credit'],
      ['4000', 'Sales Revenue', 'Revenue', 'Credit'], ['4100', 'Service Revenue', 'Revenue', 'Credit'],
      ['5000', 'Cost of Goods Sold', 'Expense', 'Debit'], ['5100', 'Salaries & Wages', 'Expense', 'Debit'],
      ['5200', 'Rent Expense', 'Expense', 'Debit'], ['5300', 'Utilities', 'Expense', 'Debit'],
      ['5400', 'Marketing', 'Expense', 'Debit'], ['5500', 'Office Supplies', 'Expense', 'Debit'],
      ['5600', 'Depreciation Expense', 'Expense', 'Debit']
    ];
    defs.forEach(function (d) { Accounting.createAccount({ accountNumber: d[0], name: d[1], type: d[2], normalBalance: d[3] }); });
    var A = function (num) { return Accounting.byNumber(num); };
    var dstr = function (monthsAgo, day) {
      var d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - monthsAgo);
      d.setDate(day);
      return d.toISOString().slice(0, 10);
    };
    var E = function (date, ref, desc, lines) {
      Accounting.createEntry({ date: date, reference: ref, description: desc, status: 'active', lines: lines });
    };
    // Opening capital contribution (3 months ago)
    E(dstr(3, 1), 'OPN-001', 'Owner capital contribution', [
      { accountId: A('1000').id, debit: 10000, credit: 0, description: 'Cash contributed' },
      { accountId: A('3000').id, debit: 0, credit: 10000, description: 'Owner equity' }
    ]);
    E(dstr(3, 1), 'OPN-002', 'Bank loan received', [
      { accountId: A('1010').id, debit: 15000, credit: 0, description: 'Loan proceeds to bank' },
      { accountId: A('2200').id, debit: 0, credit: 15000, description: 'Short-term loan' }
    ]);
    E(dstr(3, 2), 'OPN-003', 'Purchase equipment', [
      { accountId: A('1500').id, debit: 5000, credit: 0, description: 'Equipment purchase' },
      { accountId: A('1010').id, debit: 0, credit: 5000, description: 'Paid from bank' }
    ]);
    [3, 2, 1].forEach(function (mo) {
      var m = mo === 3 ? 'Jan' : mo === 2 ? 'Feb' : 'Mar';
      E(dstr(mo, 5), 'SL-' + m, 'Cash sales', [
        { accountId: A('1000').id, debit: 8000, credit: 0, description: 'Cash received' },
        { accountId: A('4000').id, debit: 0, credit: 8000, description: 'Sales revenue' }
      ]);
      E(dstr(mo, 6), 'SL-' + m + '-A', 'Credit sale to customer', [
        { accountId: A('1100').id, debit: 3500, credit: 0, description: 'Accounts receivable' },
        { accountId: A('4000').id, debit: 0, credit: 3500, description: 'Sales revenue' }
      ]);
      E(dstr(mo, 10), 'SV-' + m, 'Consulting service revenue', [
        { accountId: A('1000').id, debit: 2500, credit: 0, description: 'Cash received' },
        { accountId: A('4100').id, debit: 0, credit: 2500, description: 'Service revenue' }
      ]);
      E(dstr(mo, 12), 'RENT-' + m, 'Monthly rent', [
        { accountId: A('5200').id, debit: 1200, credit: 0, description: 'Rent expense' },
        { accountId: A('1000').id, debit: 0, credit: 1200, description: 'Paid in cash' }
      ]);
      E(dstr(mo, 15), 'PAY-' + m, 'Salaries paid', [
        { accountId: A('5100').id, debit: 3200, credit: 0, description: 'Salaries & wages' },
        { accountId: A('1010').id, debit: 0, credit: 3200, description: 'Paid from bank' }
      ]);
      E(dstr(mo, 18), 'UTIL-' + m, 'Utilities bill', [
        { accountId: A('5300').id, debit: 420, credit: 0, description: 'Utilities' },
        { accountId: A('1000').id, debit: 0, credit: 420, description: 'Paid in cash' }
      ]);
      E(dstr(mo, 20), 'MKT-' + m, 'Marketing campaign', [
        { accountId: A('5400').id, debit: 600, credit: 0, description: 'Marketing expense' },
        { accountId: A('1010').id, debit: 0, credit: 600, description: 'Paid from bank' }
      ]);
      E(dstr(mo, 22), 'INV-' + m, 'Inventory purchase on credit', [
        { accountId: A('1200').id, debit: 2000, credit: 0, description: 'Inventory' },
        { accountId: A('2000').id, debit: 0, credit: 2000, description: 'Accounts payable' }
      ]);
      E(dstr(mo, 25), 'COGS-' + m, 'Cost of goods sold', [
        { accountId: A('5000').id, debit: 1200, credit: 0, description: 'COGS' },
        { accountId: A('1200').id, debit: 0, credit: 1200, description: 'Inventory out' }
      ]);
      E(dstr(mo, 26), 'AP-' + m, 'Pay supplier', [
        { accountId: A('2000').id, debit: 1500, credit: 0, description: 'Accounts payable' },
        { accountId: A('1010').id, debit: 0, credit: 1500, description: 'Paid from bank' }
      ]);
      E(dstr(mo, 27), 'AR-' + m, 'Customer payment received', [
        { accountId: A('1000').id, debit: 2500, credit: 0, description: 'Cash received' },
        { accountId: A('1100').id, debit: 0, credit: 2500, description: 'Accounts receivable' }
      ]);
      E(dstr(mo, 28), 'DEP-' + m, 'Monthly depreciation', [
        { accountId: A('5600').id, debit: 140, credit: 0, description: 'Depreciation expense' },
        { accountId: A('1600').id, debit: 0, credit: 140, description: 'Accumulated depreciation' }
      ]);
    });
    // Budgets for current month
    var cur = new Date();
    var period = cur.getFullYear() + '-' + ('0' + (cur.getMonth() + 1)).slice(-2);
    Accounting.setBudget(A('4000').id, period, 8500);
    Accounting.setBudget(A('4100').id, period, 2500);
    Accounting.setBudget(A('5000').id, period, 1300);
    Accounting.setBudget(A('5100').id, period, 3200);
    Accounting.setBudget(A('5200').id, period, 1200);
    Accounting.setBudget(A('5300').id, period, 450);
    Accounting.setBudget(A('5400').id, period, 700);
    Audit.log('data_imported', 'Loaded sample chart of accounts and journal entries', { entityType: 'system' });
    return { ok: true };
  };

  global.Accounting = Accounting;
})(typeof window !== 'undefined' ? window : globalThis);
