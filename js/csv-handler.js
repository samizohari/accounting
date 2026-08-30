/* ============================================================
 * csv-handler.js — CSV parsing/generation + shared import
 * pipeline (validate → preview → commit with rollback).
 * Namespace: window.CSV
 * ============================================================ */
(function (global) {
  'use strict';
  var CSV = {};
  var Utils = global.Utils;
  var Audit = global.Audit;
  var Accounting = global.Accounting;

  /* ---------------- CSV parse / generate ---------------- */
  CSV.parseCSV = function (text) {
    var rows = [], row = [], field = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
    if (field.length || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
    // trim cells
    return rows.map(function (r) { return r.map(function (v) { return String(v == null ? '' : v).trim(); }); });
  };

  CSV.toCSV = function (headers, rows) {
    var esc = function (v) {
      v = String(v == null ? '' : v);
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var out = headers.map(esc).join(',');
    rows.forEach(function (r) { out += '\n' + r.map(esc).join(','); });
    return out;
  };

  CSV.downloadCSV = function (filename, headers, rows) {
    Utils.download(filename, CSV.toCSV(headers, rows), 'text/csv;charset=utf-8');
  };

  /* ---------------- Column mapping (auto-detect) ---------------- */
  CSV.mapColumn = function (header, synonyms) {
    var h = String(header).toLowerCase().replace(/[^a-z0-9]/g, '');
    for (var i = 0; i < synonyms.length; i++) {
      var s = synonyms[i];
      if (Array.isArray(s)) {
        for (var j = 0; j < s.length; j++) {
          if (h === String(s[j]).toLowerCase().replace(/[^a-z0-9]/g, '')) return s[0];
        }
      } else {
        if (h === String(s).toLowerCase().replace(/[^a-z0-9]/g, '')) return s;
      }
    }
    return null;
  };

  var SCHEMAS = {
    accounts: {
      map: {
        accountNumber: ['account number', 'number', 'code', 'accno', 'accountno', 'account_code'],
        name: ['name', 'account name', 'accountname', 'title'],
        type: ['type', 'account type', 'accounttype'],
        parentId: ['parent', 'parent number', 'parentid', 'parent_number'],
        normalBalance: ['normal balance', 'normalbalance', 'normal'],
        status: ['status']
      },
      required: ['accountNumber', 'name', 'type']
    },
    journal: {
      map: {
        date: ['date', 'posting date', 'postingdate'],
        reference: ['reference', 'ref', 'doc no', 'invoice', 'document', 'refno'],
        description: ['description', 'desc', 'memo', 'particulars', 'details', 'narration'],
        accountNumber: ['account number', 'account', 'acc no', 'accountno', 'code', 'acc'],
        debit: ['debit', 'dr', 'debit amount', 'debitamount'],
        credit: ['credit', 'cr', 'credit amount', 'creditamount']
      },
      required: ['date', 'accountNumber']
    },
    bank: {
      map: {
        date: ['date', 'transaction date', 'postingdate'],
        description: ['description', 'desc', 'particulars', 'memo', 'details', 'reference'],
        debit: ['debit', 'withdrawal', 'payment', 'outflow'],
        credit: ['credit', 'deposit', 'receipt', 'inflow'],
        balance: ['balance', 'running balance', 'runningbalance']
      },
      required: ['date']
    },
    budget: {
      map: {
        accountNumber: ['account number', 'account', 'code', 'acc', 'accountno'],
        period: ['period', 'month', 'yyyymm', 'budget period', 'budgetperiod'],
        amount: ['amount', 'budget', 'budget amount', 'budgetamount', 'planned']
      },
      required: ['accountNumber', 'amount']
    }
  };

  CSV.rowsToObjects = function (headers, rows) {
    return rows.map(function (r) {
      var o = {};
      headers.forEach(function (h, i) { o[h] = r[i] !== undefined ? r[i] : ''; });
      return o;
    });
  };

  /* ---------------- Import pipeline ---------------- */
  // Returns { ok, total, valid, errors[], preview[], summary }
  CSV.processImport = function (type, objects, opts) {
    opts = opts || {};
    var schema = SCHEMAS[type];
    if (!schema) return { ok: false, error: 'Unknown import type: ' + type };
    if (!global.Permissions || !global.Permissions.can('import_data')) return { ok: false, error: 'Not permitted: import requires the Accountant or Admin role' };
    var user = global.Auth && global.Auth.getCurrentUser();
    if (!user) return { ok: false, error: 'Not logged in' };

    var errors = [], validRows = [], rowNum = 0;
    objects.forEach(function (obj) {
      rowNum++;
      var mapped = {};
      Object.keys(schema.map).forEach(function (field) {
        var found = null;
        Object.keys(obj).forEach(function (k) {
          var v = CSV.mapColumn(k, schema.map[field]);
          if (v && !found) found = obj[k];
        });
        mapped[field] = found === null || found === undefined ? '' : found;
      });
      var errs = [];
      schema.required.forEach(function (f) {
        if (mapped[f] === '' || mapped[f] == null) errs.push('Missing required column: ' + f);
      });
      if (type === 'accounts') {
        var t = String(mapped.type || '').toLowerCase();
        if (!/(asset|liability|equity|revenue|expense)/.test(t)) errs.push('Invalid account type: ' + mapped.type);
        if (Accounting.byNumber(mapped.accountNumber)) errs.push('Account number already exists: ' + mapped.accountNumber);
      }
      if (type === 'journal') {
        if (!Accounting.byNumber(mapped.accountNumber)) errs.push('Unknown account number: ' + mapped.accountNumber);
        if (!mapped.debit && !mapped.credit) errs.push('Line has no debit or credit');
        if (mapped.debit && mapped.credit) errs.push('Line has both debit and credit');
      }
      if (type === 'budget') {
        if (!Accounting.byNumber(mapped.accountNumber)) errs.push('Unknown account number: ' + mapped.accountNumber);
        if (!/^\d{4}-\d{2}$/.test(mapped.period)) errs.push('Period must be YYYY-MM: ' + mapped.period);
      }
      if (errs.length) {
        errs.forEach(function (e) { errors.push({ row: rowNum, error: e }); });
      } else {
        mapped._row = rowNum;
        validRows.push(mapped);
      }
    });

    var result = {
      ok: true,
      type: type,
      total: objects.length,
      valid: validRows.length,
      errorCount: errors.length,
      errors: errors,
      preview: validRows.slice(0, 8).map(function (r) {
        var c = {};
        Object.keys(schema.map).forEach(function (f) { c[f] = r[f]; });
        return c;
      }),
      validRows: validRows
    };

    if (!opts.preview) {
      var commit = CSV.commitImport(type, validRows);
      result.commit = commit;
      result.ok = commit.ok;
      result.error = commit.error;
      if (commit.ok) {
        Audit.log('data_imported', 'Imported ' + commit.count + ' ' + type + ' record(s) from ' + (opts.source || type), { entityType: type });
      }
    }
    return result;
  };

  CSV.commitImport = function (type, validRows) {
    var snapshot = Utils.loadData(Utils.K.ACCOUNTS, []).slice();
    var entriesSnap = Utils.loadData(Utils.K.ENTRIES, []).slice();
    var linesSnap = Utils.loadData(Utils.K.LINES, []).slice();
    var budgetSnap = Utils.loadData(Utils.K.BUDGET, []).slice();
    try {
      if (type === 'accounts') {
        validRows.forEach(function (r) {
          Accounting.createAccount({
            accountNumber: r.accountNumber,
            name: r.name,
            type: r.type.charAt(0).toUpperCase() + r.type.slice(1).toLowerCase(),
            parentId: r.parentId ? (Accounting.byNumber(r.parentId) ? Accounting.byNumber(r.parentId).id : null) : null,
            normalBalance: r.normalBalance || undefined,
            status: /inactive/i.test(r.status) ? 'inactive' : 'active'
          });
        });
        return { ok: true, count: validRows.length };
      }
      if (type === 'journal') {
        // Group lines into entries by date|reference|description
        var groups = {};
        validRows.forEach(function (r) {
          var key = r.date + '|' + (r.reference || '') + '|' + (r.description || '');
          if (!groups[key]) groups[key] = { date: r.date, reference: r.reference, description: r.description, lines: [] };
          var acc = Accounting.byNumber(r.accountNumber);
          groups[key].lines.push({ accountId: acc.id, debit: Utils.parseMoney(r.debit), credit: Utils.parseMoney(r.credit), description: '' });
        });
        var count = 0;
        Object.keys(groups).forEach(function (key) {
          var g = groups[key];
          var res = Accounting.createEntry({ date: g.date, reference: g.reference, description: g.description || 'Imported entry', status: 'active', lines: g.lines });
          if (res.ok) count++;
        });
        return { ok: true, count: count };
      }
      if (type === 'budget') {
        validRows.forEach(function (r) {
          var acc = Accounting.byNumber(r.accountNumber);
          Accounting.setBudget(acc.id, r.period, Utils.parseMoney(r.amount));
        });
        return { ok: true, count: validRows.length };
      }
      if (type === 'bank') {
        // Bank statement: match to entries by date+amount, mark reconciled; store unmatched lines
        var matched = 0, unmatched = [];
        validRows.forEach(function (r) {
          var amt = Utils.parseMoney(r.debit) || Utils.parseMoney(r.credit);
          var entries = Accounting.getEntries().filter(function (e) {
            if (e.date !== r.date) return false;
            if (Accounting.isReconciled(e.id)) return false;
            var t = Accounting.entryTotals(Accounting.entryLines(e.id));
            return Math.abs(Math.max(t.debit, t.credit) - amt) < 0.01;
          });
          if (entries.length) {
            Accounting.markReconciled([entries[0].id]);
            matched++;
          } else {
            unmatched.push({ date: r.date, description: r.description, debit: Utils.parseMoney(r.debit), credit: Utils.parseMoney(r.credit) });
          }
        });
        var stmt = Utils.loadData('acc_bank_statement', []);
        stmt = stmt.concat(unmatched.map(function (u) {
          return { id: 'bs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), userId: Accounting.uid(), date: u.date, description: u.description, debit: u.debit, credit: u.credit, importedAt: Utils.nowISO() };
        }));
        Utils.saveData('acc_bank_statement', stmt);
        return { ok: true, count: matched, matched: matched, unmatched: unmatched.length };
      }
      return { ok: false, error: 'Unsupported type' };
    } catch (e) {
      // Rollback on failure
      Utils.saveData(Utils.K.ACCOUNTS, snapshot);
      Utils.saveData(Utils.K.ENTRIES, entriesSnap);
      Utils.saveData(Utils.K.LINES, linesSnap);
      Utils.saveData(Utils.K.BUDGET, budgetSnap);
      return { ok: false, error: 'Import failed and was rolled back: ' + e.message };
    }
  };

  CSV.errorReport = function (errors) {
    return CSV.toCSV(['Row', 'Error'], errors.map(function (e) { return [e.row, e.error]; }));
  };

  CSV.exportCSVFile = function (kind) {
    if (!global.Permissions || !global.Permissions.can('export_data')) { Utils.toast('Not permitted: export requires the Accountant or Admin role', 'error'); return; }
    var user = global.Auth && global.Auth.getCurrentUser();
    var stamp = Utils.todayStr();
    if (kind === 'accounts') {
      var accs = Accounting.getAccounts().map(function (a) {
        var p = a.parentId ? Accounting.getAccount(a.parentId) : null;
        return [a.accountNumber, a.name, a.type, p ? p.accountNumber : '', a.normalBalance, a.status];
      });
      CSV.downloadCSV('chart-of-accounts-' + stamp + '.csv', ['Account Number', 'Name', 'Type', 'Parent', 'Normal Balance', 'Status'], accs);
    } else if (kind === 'journal') {
      var rows = [];
      Accounting.getEntries().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (e) {
        Accounting.entryLines(e.id).forEach(function (l) {
          var acc = Accounting.getAccount(l.accountId);
          rows.push([e.date, e.reference, e.description, acc ? acc.accountNumber : '', l.debit, l.credit, e.status]);
        });
      });
      CSV.downloadCSV('journal-entries-' + stamp + '.csv', ['Date', 'Reference', 'Description', 'Account Number', 'Debit', 'Credit', 'Status'], rows);
    } else if (kind === 'ledger') {
      var accId = document.getElementById('ledgerAccount') ? document.getElementById('ledgerAccount').value : '';
      var acc = Accounting.getAccount(accId);
      if (!acc) { Utils.toast('Select an account first', 'warning'); return; }
      var lg = Accounting.getLedger(accId, {});
      var lrows = lg.rows.map(function (r) { return [r.date, r.reference, r.description, r.debit, r.credit, r.balance]; });
      CSV.downloadCSV('ledger-' + acc.accountNumber + '-' + stamp + '.csv', ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'], lrows);
    } else if (kind === 'trial-balance') {
      var tb = Accounting.getTrialBalance({});
      var trows = tb.rows.map(function (r) {
        return [r.account ? r.account.accountNumber + ' ' + r.account.name : r.label, r.debit, r.credit];
      });
      trows.push(['TOTALS', tb.totalDebit, tb.totalCredit]);
      CSV.downloadCSV('trial-balance-' + stamp + '.csv', ['Account', 'Debit', 'Credit'], trows);
    }
    if (kind !== 'ledger' && kind !== 'trial-balance') {
      Audit.log('data_exported', 'Exported ' + kind + ' data to CSV', { entityType: kind });
    }
  };

  global.CSV = CSV;
})(typeof window !== 'undefined' ? window : globalThis);
