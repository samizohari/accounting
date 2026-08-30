/* ============================================================
 * app.js — Main application: router, view renderers, auth UI,
 * event delegation, initialization.
 * Namespace: window.App
 * ============================================================ */
(function (global) {
  'use strict';
  var App = {};
  var Utils = global.Utils;
  var Auth = global.Auth;
  var Audit = global.Audit;
  var Permissions = global.Permissions;
  var Accounting = global.Accounting;
  var CSV = global.CSV;
  var Excel = global.Excel;
  var Reports = global.Reports;
  var Dashboard = global.Dashboard;
  var Admin = global.Admin;

  function $id(id) { return document.getElementById(id); }

  App.view = 'dashboard';
  var sessionTimer = null;

  /* ================= ROUTER ================= */
  var VIEW_TITLES = {
    dashboard: 'Dashboard', accounts: 'Chart of Accounts', journal: 'Journal Entries',
    ledger: 'General Ledger', 'trial-balance': 'Trial Balance', reports: 'Financial Reports',
    reconciliation: 'Bank Reconciliation', budget: 'Budget & Variance', data: 'Import / Export',
    users: 'User Management', audit: 'Audit Log', settings: 'System Settings',
    'data-mgmt': 'Data Management', profile: 'My Profile'
  };

  var REFRESH_HOOKS = {
    // NOTE: lazy closures — direct references like `App.renderJournal` would be
    // undefined here because these functions are defined in part 2 of this file.
    dashboard: function () { Dashboard.render(); },
    accounts: function () { App.renderAccounts(); },
    journal: function () { App.renderJournal(); },
    ledger: function () { App.renderLedger(); },
    'trial-balance': function () { App.renderTB(); },
    reports: function () { Reports.setDefaultPeriods(); Reports.renderAll(); },
    reconciliation: function () { App.renderRecon(); },
    budget: function () { App.renderBudget(); },
    data: null,
    users: function () { Admin.renderUsers(); },
    audit: function () { Admin.initAuditFilters(); Admin.renderAudit(); },
    settings: function () { Admin.fillSettingsForm(); },
    'data-mgmt': function () { Admin.updateStorageInfo(); },
    profile: function () { App.renderProfile(); }
  };

  App.showView = function (name) {
    if (!VIEW_TITLES[name]) name = 'dashboard';
    // Permission gate for admin-only views
    if (['users', 'audit', 'settings', 'data-mgmt'].indexOf(name) >= 0 && !Permissions.can(name === 'users' ? 'manage_users' : name === 'audit' ? 'view_audit_log' : name === 'settings' ? 'system_settings' : 'backup_restore')) {
      name = 'dashboard';
    }
    App.view = name;
    document.querySelectorAll('.view').forEach(function (v) { v.classList.add('d-none'); });
    var sec = document.querySelector('.view[data-view="' + name + '"]');
    if (sec) sec.classList.remove('d-none');
    document.querySelectorAll('[data-view]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-view') === name);
    });
    $id('pageTitle').textContent = VIEW_TITLES[name];
    // close mobile sidebar/bottom nav after navigation
    var sb = $id('sidebar');
    if (sb && sb.classList.contains('show') && global.bootstrap) {
      var inst = bootstrap.Offcanvas.getInstance(sb) || new bootstrap.Offcanvas(sb);
      if (window.innerWidth < 992) inst.hide();
    }
    var hook = REFRESH_HOOKS[name];
    if (hook) hook();
    document.querySelector('.content').scrollTop = 0;
    window.scrollTo(0, 0);
  };

  App.refreshCurrentView = function () {
    var hook = REFRESH_HOOKS[App.view];
    if (hook) hook();
  };

  /* ================= AUTH UI ================= */
  App.initAuthUI = function () {
    var loginForm = $id('loginForm');
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $id('loginError');
      err.classList.add('d-none');
      var res = Auth.login($id('loginIdentifier').value, $id('loginPassword').value, $id('rememberMe').checked);
      if (res.ok) {
        Accounting.runDueRecurring();
        App.enterApp();
        Utils.toast('Welcome back, ' + res.user.username + '!', 'success');
      } else {
        err.textContent = res.error;
        err.classList.remove('d-none');
        if (res.locked) $id('loginLock').classList.remove('d-none');
      }
    });
    $id('btnTogglePw').addEventListener('click', function () {
      var inp = $id('loginPassword');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      this.querySelector('i').className = inp.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
    });
    // register
    var regForm = $id('registerForm');
    $id('regPassword').addEventListener('input', function () {
      var s = Auth.checkStrength(this.value);
      var bars = document.querySelectorAll('#pwMeter .pw-meter-bars span');
      bars.forEach(function (b, i) { b.className = i < s.bars ? 'on' : ''; });
      $id('pwMeterLabel').textContent = s.label;
    });
    $id('regUsername').addEventListener('input', Utils.debounce(function () {
      var v = this.value.trim();
      var hint = $id('regUsernameHint');
      if (v.length < 3) { hint.textContent = 'Check availability as you type'; hint.className = 'form-text small'; return; }
      if (Auth.usernameExists(v)) { hint.textContent = '✗ Username is taken'; hint.className = 'form-text small text-danger'; }
      else { hint.textContent = '✓ Username available'; hint.className = 'form-text small text-success'; }
    }, 350));
    App.regCaptchaAnswer = Math.floor(Math.random() * 8) + 2;
    $id('regCaptchaLabel').textContent = 'What is ' + App.regCaptchaAnswer + ' + ' + (10 - App.regCaptchaAnswer) + '?';
    regForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $id('regError');
      err.classList.add('d-none');
      var captcha = parseInt($id('regCaptcha').value, 10);
      if (captcha !== 10) {
        err.textContent = 'Incorrect security answer. Try again.';
        err.classList.remove('d-none');
        App.regCaptchaAnswer = Math.floor(Math.random() * 8) + 2;
        $id('regCaptchaLabel').textContent = 'What is ' + App.regCaptchaAnswer + ' + ' + (10 - App.regCaptchaAnswer) + '?';
        $id('regCaptcha').value = '';
        return;
      }
      var res = Auth.registerUser({
        fullName: $id('regFullName').value, email: $id('regEmail').value,
        username: $id('regUsername').value, password: $id('regPassword').value,
        confirm: $id('regConfirm').value, terms: $id('regTerms').checked
      });
      if (res.ok) {
        $id('regSuccess').classList.remove('d-none');
        $id('regSuccess').textContent = '✓ Registration successful! A verification email was sent (simulated). Please log in.';
        console.log('[SIMULATED EMAIL] Verification email → ' + res.user.email);
        regForm.reset();
        setTimeout(function () {
          $id('regSuccess').classList.add('d-none');
          bootstrap.Tab.getOrCreateInstance($id('tabLogin')).show();
        }, 3000);
      } else {
        err.innerHTML = res.errors.map(function (x) { return '• ' + Utils.escapeHtml(x); }).join('<br>');
        err.classList.remove('d-none');
      }
    });
    // forgot password
    $id('linkForgot').addEventListener('click', function (e) {
      e.preventDefault();
      document.querySelector('.auth-tabs').classList.add('d-none');
      document.querySelector('.tab-content').classList.add('d-none');
      $id('forgotPanel').classList.remove('d-none');
    });
    $id('linkBackLogin').addEventListener('click', function (e) {
      e.preventDefault();
      $id('forgotPanel').classList.add('d-none');
      document.querySelector('.auth-tabs').classList.remove('d-none');
      document.querySelector('.tab-content').classList.remove('d-none');
    });
    var forgotForm = $id('forgotForm');
    forgotForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var res = Auth.requestPasswordReset($id('forgotEmail').value);
      var box = $id('forgotResult');
      if (res.ok) {
        box.classList.remove('d-none');
        $id('forgotLink').innerHTML = 'Demo link: <code>' + Utils.escapeHtml(res.token) + '</code><br><button class="btn btn-sm btn-primary mt-2 btn-touch" id="btnUseResetLink">Use this link (demo)</button>';
        $id('btnUseResetLink').addEventListener('click', App.useResetLink.bind(null, res.token));
      } else {
        box.classList.remove('d-none');
        $id('forgotLink').innerHTML = '<span class="text-danger">' + Utils.escapeHtml(res.error) + '</span>';
      }
    });
  };

  App.useResetLink = function (token) {
    var newPw = window.prompt('Enter your new password (min 8 chars, 1 upper, 1 lower, 1 number, 1 special):');
    if (!newPw) return;
    var confirm = window.prompt('Confirm your new password:');
    if (newPw !== confirm) { Utils.toast('Passwords do not match', 'error'); return; }
    var res = Auth.resetPasswordWithToken(token, newPw);
    if (res.ok) {
      Utils.toast('Password reset successful. Please log in.', 'success');
      $id('forgotPanel').classList.add('d-none');
      document.querySelector('.auth-tabs').classList.remove('d-none');
      document.querySelector('.tab-content').classList.remove('d-none');
    } else {
      Utils.toast(res.error, 'error');
    }
  };

  /* ================= APP ENTRY / EXIT ================= */
  App.enterApp = function () {
    Admin.updateAdminUI();
    $id('screenAuth').classList.add('d-none');
    $id('screenApp').classList.remove('d-none');
    var appUser = Auth.getCurrentUser();
    App.setTheme(appUser ? appUser.preferences.theme : 'auto');
    Reports.setDefaultPeriods();
    App.showView(App.view);
    App.startSessionWatch();
    var user = Auth.getCurrentUser();
    if (user && user.force_pw_change) {
      Utils.toast('Please change your password', 'warning');
      App.showView('profile');
    }
    Admin.updateStorageInfo();
  };

  App.exitApp = function () {
    Auth.logout();
    App.stopSessionWatch();
    $id('screenApp').classList.add('d-none');
    $id('screenAuth').classList.remove('d-none');
    $id('loginPassword').value = '';
    $id('loginError').classList.add('d-none');
    $id('loginLock').classList.add('d-none');
  };

  /* ================= SESSION WATCH ================= */
  App.startSessionWatch = function () {
    App.stopSessionWatch();
    ['click', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(function (ev) {
      document.addEventListener(ev, App.sessionActivity, { passive: true });
    });
    sessionTimer = setInterval(App.sessionTick, 15000);
  };
  App.stopSessionWatch = function () {
    ['click', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(function (ev) {
      document.removeEventListener(ev, App.sessionActivity);
    });
    if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  };
  App.sessionActivity = function () {
    if (!Auth.getSession()) return;
    Auth.touchSession();
  };
  App.sessionTick = function () {
    if (!Auth.validateSession()) { App.exitApp(); Utils.toast('Session expired. Please log in again.', 'warning'); return; }
    var s = Auth.getSession();
    if (!s || s.remember) return;
    var left = new Date(s.expiresAt).getTime() - Date.now();
    if (left < 60000 && left > 0) {
      var toast = $id('sessionToast');
      if (toast && global.bootstrap) {
        var t = bootstrap.Toast.getInstance(toast) || new bootstrap.Toast(toast, { delay: 50000 });
        t.show();
      }
    }
  };

  /* ================= VIEW: ACCOUNTS ================= */
  App.renderAccounts = function () {
    var q = ($id('accountSearch').value || '').toLowerCase();
    var typeF = $id('accountTypeFilter').value;
    var accounts = Accounting.getAccounts().filter(function (a) {
      if (q && (a.name + ' ' + a.accountNumber).toLowerCase().indexOf(q) === -1) return false;
      if (typeF && a.type !== typeF) return false;
      return true;
    }).sort(function (a, b) { return a.accountNumber < b.accountNumber ? -1 : 1; });
    var rows = accounts.map(function (a) {
      var p = a.parentId ? Accounting.getAccount(a.parentId) : null;
      var b = Accounting.accountBalance(a.id);
      var bal = a.normalBalance === 'Credit' ? b.credit - b.debit : b.debit - b.credit;
      return '<tr>' +
        '<td><code>' + Utils.escapeHtml(a.accountNumber) + '</code></td>' +
        '<td>' + Utils.escapeHtml(a.name) + '</td>' +
        '<td><span class="badge ' + ({ Asset: 'text-bg-primary', Liability: 'text-bg-warning', Equity: 'text-bg-success', Revenue: 'text-bg-info', Expense: 'text-bg-danger' }[a.type] || 'text-bg-secondary') + '">' + a.type + '</span></td>' +
        '<td>' + (p ? Utils.escapeHtml(p.accountNumber + ' ' + p.name) : '—') + '</td>' +
        '<td>' + a.normalBalance + '</td>' +
        '<td class="text-end ' + (bal < 0 ? 'text-danger' : '') + '">' + Utils.fmtMoney(bal) + '</td>' +
        '<td><span class="badge ' + (a.status === 'active' ? 'text-bg-success' : 'text-bg-secondary') + '">' + a.status + '</span></td>' +
        '<td class="text-end text-nowrap">' +
          (Permissions.can('edit_account') ? '<button class="btn btn-sm btn-outline-primary btn-touch" data-action="edit-account" data-id="' + a.id + '"><i class="bi bi-pencil"></i></button> ' : '') +
          (Permissions.can('delete_account') ? '<button class="btn btn-sm btn-outline-danger btn-touch" data-action="delete-account" data-id="' + a.id + '"><i class="bi bi-trash"></i></button>' : '') +
        '</td></tr>';
    });
    $id('accountsTableBody').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="8" class="text-center text-muted py-4">No accounts yet — create your first account or import from Excel/CSV.</td></tr>';
  };

  App.populateAccountOptions = function (excludeId) {
    var accounts = Accounting.getAccounts().filter(function (a) { return a.id !== excludeId; });
    var opts = '<option value="">— None (Top Level) —</option>' + accounts.map(function (a) {
      return '<option value="' + a.id + '">' + Utils.escapeHtml(a.accountNumber + ' ' + a.name) + ' (' + a.type + ')</option>';
    }).join('');
    var parentSel = $id('accParent');
    if (parentSel) parentSel.innerHTML = opts;
  };

  App.populateAccountSelects = function () {
    var accounts = Accounting.getAccounts().filter(function (a) { return a.status === 'active'; });
    var opts = accounts.map(function (a) {
      return '<option value="' + a.id + '">' + Utils.escapeHtml(a.accountNumber + ' — ' + a.name) + '</option>';
    }).join('');
    var sel = $id('ledgerAccount');
    if (sel) {
      var cur = sel.value;
      sel.innerHTML = opts;
      if (cur && accounts.some(function (a) { return a.id === cur; })) sel.value = cur;
      if (!sel.value && accounts.length) sel.value = accounts[0].id;
    }
  };

  App.openAccountModal = function (id) {
    if (!Permissions.can('create_account')) { Utils.toast('Not permitted', 'error'); return; }
    $id('accountModalTitle').textContent = id ? 'Edit Account' : 'New Account';
    $id('accountForm').reset();
    $id('accId').value = id || '';
    $id('accountModalError').classList.add('d-none');
    var acc = id ? Accounting.getAccount(id) : null;
    App.populateAccountOptions(id);
    if (acc) {
      $id('accNumber').value = acc.accountNumber;
      $id('accName').value = acc.name;
      $id('accType').value = acc.type;
      $id('accParent').value = acc.parentId || '';
      $id('accNormalBalance').value = acc.normalBalance;
      $id('accStatus').value = acc.status;
    } else {
      var type = $id('accType').value;
      $id('accNumber').value = Accounting.nextAccountNumber(type);
      $id('accNormalBalance').value = type === 'Asset' || type === 'Expense' ? 'Debit' : 'Credit';
    }
    new bootstrap.Modal($id('modalAccount')).show();
  };

  App.submitAccountForm = function (e) {
    e.preventDefault();
    var id = $id('accId').value;
    var data = {
      accountNumber: $id('accNumber').value, name: $id('accName').value,
      type: $id('accType').value, parentId: $id('accParent').value || null,
      normalBalance: $id('accNormalBalance').value, status: $id('accStatus').value
    };
    var res = id ? Accounting.updateAccount(id, data) : Accounting.createAccount(data);
    if (!res.ok) {
      var err = $id('accountModalError');
      err.textContent = res.error;
      err.classList.remove('d-none');
      return;
    }
    bootstrap.Modal.getInstance($id('modalAccount')).hide();
    App.renderAccounts();
    Utils.toast(id ? 'Account updated' : 'Account created', 'success');
  };

  App.deleteAccountConfirm = function (id) {
    var acc = Accounting.getAccount(id);
    if (!acc) return;
    Utils.confirm('Delete Account', 'Delete account <strong>' + Utils.escapeHtml(acc.accountNumber + ' ' + acc.name) + '</strong>?<br><small>Accounts with transactions or children cannot be deleted (admin can force).</small>', function () {
      var res = Accounting.deleteAccount(id, false);
      if (!res.ok) {
        if (Permissions.can('delete_any_transaction')) {
          Utils.confirm('Force Delete', res.error + '<br><br>Force-delete anyway (also removes its journal lines)?', function () {
            Accounting.deleteAccount(id, true);
            App.renderAccounts();
            Utils.toast('Account force-deleted', 'warning');
          }, 'Force Delete');
        } else {
          Utils.toast(res.error, 'error');
        }
        return;
      }
      App.renderAccounts();
      Utils.toast('Account deleted', 'success');
    });
  };

  global.App = App;
})(typeof window !== 'undefined' ? window : globalThis);
/* ================= PART 2: view renderers, modals, wiring ================= */
(function (global) {
  'use strict';
  var App = global.App;
  var Utils = global.Utils;
  var Auth = global.Auth;
  var Audit = global.Audit;
  var Permissions = global.Permissions;
  var Accounting = global.Accounting;
  var CSV = global.CSV;
  var Excel = global.Excel;
  var Reports = global.Reports;
  var Admin = global.Admin;

  function $id(id) { return document.getElementById(id); }
  function esc(s) { return Utils.escapeHtml(s); }

  /* ================= VIEW: JOURNAL ================= */
  App.renderJournal = function () {
    var from = $id('journalFrom').value, to = $id('journalTo').value;
    var q = ($id('journalSearch').value || '').toLowerCase();
    var entries = Accounting.getEntries().filter(function (e) {
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      if (q && (e.description + ' ' + (e.reference || '') + ' ' + e.notes).toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var rows = entries.map(function (e) {
      var t = Accounting.entryTotals(Accounting.entryLines(e.id));
      var badge = e.status === 'approved' ? 'text-bg-success' : e.status === 'draft' ? 'text-bg-secondary' : e.status === 'rejected' ? 'text-bg-danger' : 'text-bg-primary';
      var acts = '<button class="btn btn-sm btn-outline-secondary btn-touch" data-action="view-entry" data-id="' + e.id + '" title="View"><i class="bi bi-eye"></i></button> ';
      if (Permissions.can('edit_journal_entry')) acts += '<button class="btn btn-sm btn-outline-primary btn-touch" data-action="edit-entry" data-id="' + e.id + '" title="Edit"><i class="bi bi-pencil"></i></button> ';
      if (Permissions.can('edit_journal_entry') && e.status === 'active') acts += '<button class="btn btn-sm btn-outline-success btn-touch" data-action="approve-entry" data-id="' + e.id + '" title="Approve"><i class="bi bi-check2"></i></button> ';
      if (Permissions.can('edit_journal_entry')) acts += '<button class="btn btn-sm btn-outline-warning btn-touch" data-action="reverse-entry" data-id="' + e.id + '" title="Reverse"><i class="bi bi-arrow-counterclockwise"></i></button> ';
      if (Permissions.can('delete_journal_entry')) acts += '<button class="btn btn-sm btn-outline-danger btn-touch" data-action="delete-entry" data-id="' + e.id + '" title="Delete"><i class="bi bi-trash"></i></button>';
      return '<tr><td>' + Utils.fmtDate(e.date) + '</td><td>' + esc(e.reference || '—') + '</td><td>' + esc(e.description) + '</td>' +
        '<td class="text-end">' + Utils.fmtMoney(t.debit) + '</td><td class="text-end">' + Utils.fmtMoney(t.credit) + '</td>' +
        '<td><span class="badge ' + badge + '">' + e.status + '</span>' + (e.approved_by ? ' <i class="bi bi-patch-check text-success" title="Approved"></i>' : '') + '</td>' +
        '<td class="text-end text-nowrap">' + acts + '</td></tr>';
    });
    $id('journalTableBody').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="7" class="text-center text-muted py-4">No journal entries in this range</td></tr>';
  };

  App.entryAccountsCache = [];
  App.openEntryModal = function (id) {
    if (!Permissions.can('create_journal_entry')) { Utils.toast('Not permitted', 'error'); return; }
    App.entryAccountsCache = Accounting.getAccounts().filter(function (a) { return a.status === 'active'; });
    $id('entryModalTitle').textContent = id ? 'Edit Journal Entry' : 'New Journal Entry';
    $id('entryForm').reset();
    $id('entryId').value = id || '';
    $id('entryModalError').classList.add('d-none');
    $id('entryDate').value = Utils.todayStr();
    var entry = id ? Accounting.getEntry(id) : null;
    if (entry) {
      $id('entryDate').value = entry.date;
      $id('entryReference').value = entry.reference;
      $id('entryDescription').value = entry.description;
      $id('entryNotes').value = entry.notes;
      $id('entryStatus').value = entry.status;
      $id('entryRecurring').value = '';
      App.entryLinesBody(Accounting.entryLines(id));
    } else {
      App.entryLinesBody([{ accountId: '', debit: 0, credit: 0, description: '' }, { accountId: '', debit: 0, credit: 0, description: '' }]);
    }
    App.recalcEntryTotals();
    new bootstrap.Modal($id('modalEntry')).show();
  };

  App.entryLinesBody = function (lines) {
    var opts = '<option value="">— Select Account —</option>' + App.entryAccountsCache.map(function (a) {
      return '<option value="' + a.id + '">' + esc(a.accountNumber + ' — ' + a.name) + '</option>';
    }).join('');
    var html = (lines || []).map(function (l) {
      return '<tr>' +
        '<td><select class="form-select form-select-sm line-account">' + opts + '</select></td>' +
        '<td><input type="text" class="form-control form-control-sm line-desc" value="' + esc(l.description || '') + '" placeholder="Line note"></td>' +
        '<td><input type="number" step="0.01" min="0" class="form-control form-control-sm text-end line-debit" value="' + (l.debit || '') + '" placeholder="0.00" inputmode="decimal"></td>' +
        '<td><input type="number" step="0.01" min="0" class="form-control form-control-sm text-end line-credit" value="' + (l.credit || '') + '" placeholder="0.00" inputmode="decimal"></td>' +
        '<td><button type="button" class="btn btn-sm btn-outline-danger btn-touch line-remove" tabindex="-1"><i class="bi bi-x-lg"></i></button></td></tr>';
    }).join('');
    $id('entryLinesBody').innerHTML = html;
    $id('entryLinesBody').querySelectorAll('tr').forEach(function (tr) {
      var sel = tr.querySelector('.line-account');
      if (sel) {
        var accId = null;
        // set selected after render
      }
    });
    // set selected accounts
    (lines || []).forEach(function (l, i) {
      var tr = $id('entryLinesBody').querySelectorAll('tr')[i];
      if (tr && l.accountId) tr.querySelector('.line-account').value = l.accountId;
    });
  };

  App.addEntryLine = function () {
    var opts = '<option value="">— Select Account —</option>' + App.entryAccountsCache.map(function (a) {
      return '<option value="' + a.id + '">' + esc(a.accountNumber + ' — ' + a.name) + '</option>';
    }).join('');
    var tr = document.createElement('tr');
    tr.innerHTML = '<td><select class="form-select form-select-sm line-account">' + opts + '</select></td>' +
      '<td><input type="text" class="form-control form-control-sm line-desc" placeholder="Line note"></td>' +
      '<td><input type="number" step="0.01" min="0" class="form-control form-control-sm text-end line-debit" placeholder="0.00" inputmode="decimal"></td>' +
      '<td><input type="number" step="0.01" min="0" class="form-control form-control-sm text-end line-credit" placeholder="0.00" inputmode="decimal"></td>' +
      '<td><button type="button" class="btn btn-sm btn-outline-danger btn-touch line-remove" tabindex="-1"><i class="bi bi-x-lg"></i></button></td>';
    $id('entryLinesBody').appendChild(tr);
  };

  App.recalcEntryTotals = function () {
    var d = 0, c = 0;
    $id('entryLinesBody').querySelectorAll('tr').forEach(function (tr) {
      d += Utils.parseMoney(tr.querySelector('.line-debit').value);
      c += Utils.parseMoney(tr.querySelector('.line-credit').value);
    });
    $id('entryTotalDebit').textContent = Utils.fmtNumber(d);
    $id('entryTotalCredit').textContent = Utils.fmtNumber(c);
    var bal = Math.abs(d - c) < 0.005 && (d > 0 || c > 0);
    var badge = $id('entryBalanceStatus');
    if (!bal) { badge.classList.remove('d-none'); badge.textContent = 'Entry is not balanced (diff ' + Utils.fmtMoney(d - c) + ')'; }
    else badge.classList.add('d-none');
    return bal;
  };

  App.submitEntryForm = function (e) {
    e.preventDefault();
    var lines = [];
    $id('entryLinesBody').querySelectorAll('tr').forEach(function (tr) {
      lines.push({
        accountId: tr.querySelector('.line-account').value,
        debit: tr.querySelector('.line-debit').value,
        credit: tr.querySelector('.line-credit').value,
        description: tr.querySelector('.line-desc').value
      });
    });
    var id = $id('entryId').value;
    var data = {
      date: $id('entryDate').value, reference: $id('entryReference').value,
      description: $id('entryDescription').value, notes: $id('entryNotes').value,
      status: $id('entryStatus').value, recurring: $id('entryRecurring').value,
      lines: lines
    };
    if (!id && $id('entryRecurring').value) data.approved = true;
    var res = id ? Accounting.updateEntry(id, data) : Accounting.createEntry(data);
    if (!res.ok) {
      var err = $id('entryModalError');
      err.textContent = res.error;
      err.classList.remove('d-none');
      return;
    }
    bootstrap.Modal.getInstance($id('modalEntry')).hide();
    App.renderJournal();
    Utils.toast(id ? 'Entry updated' : 'Entry created and balanced ✓', 'success');
  };

  App.viewEntry = function (id) {
    var e = Accounting.getEntry(id);
    if (!e) return;
    var t = Accounting.entryTotals(Accounting.entryLines(id));
    var lines = Accounting.entryLines(id).map(function (l) {
      var acc = Accounting.getAccount(l.accountId);
      return '<tr><td>' + (acc ? esc(acc.accountNumber + ' ' + acc.name) : esc(l.accountId)) + '</td><td>' + esc(l.description || '') + '</td>' +
        '<td class="text-end">' + (l.debit ? Utils.fmtMoney(l.debit) : '') + '</td><td class="text-end">' + (l.credit ? Utils.fmtMoney(l.credit) : '') + '</td></tr>';
    }).join('');
    $id('entryViewBody').innerHTML =
      '<div class="row g-2 small mb-3"><div class="col-6 col-md-3"><strong>Date:</strong> ' + Utils.fmtDate(e.date) + '</div>' +
      '<div class="col-6 col-md-3"><strong>Reference:</strong> ' + esc(e.reference || '—') + '</div>' +
      '<div class="col-md-6"><strong>Description:</strong> ' + esc(e.description) + '</div>' +
      '<div class="col-6 col-md-3"><strong>Status:</strong> ' + esc(e.status) + '</div>' +
      '<div class="col-6 col-md-3"><strong>Created:</strong> ' + esc(Auth.getUser(e.created_by) ? Auth.getUser(e.created_by).username : e.created_by) + ' on ' + Utils.fmtDateTime(e.created_at) + '</div>' +
      '<div class="col-md-6"><strong>Notes:</strong> ' + esc(e.notes || '—') + '</div></div>' +
      '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Account</th><th>Description</th><th class="text-end">Debit</th><th class="text-end">Credit</th></tr></thead><tbody>' + lines +
      '<tr class="table-light fw-bold"><td colspan="2">TOTALS</td><td class="text-end">' + Utils.fmtMoney(t.debit) + '</td><td class="text-end">' + Utils.fmtMoney(t.credit) + '</td></tr></tbody></table></div>';
    new bootstrap.Modal($id('modalEntryView')).show();
  };

  App.approveEntryConfirm = function (id) {
    var e = Accounting.getEntry(id);
    if (!e) return;
    Utils.confirm('Approve Entry', 'Approve journal entry <strong>' + esc(e.reference || e.id) + '</strong>?', function () {
      Accounting.approveEntry(id);
      App.renderJournal();
      Utils.toast('Entry approved', 'success');
    });
  };

  App.reverseEntryConfirm = function (id) {
    var e = Accounting.getEntry(id);
    if (!e) return;
    Utils.confirm('Reverse Entry', 'Create a reversing entry for <strong>' + esc(e.reference || e.id) + '</strong>? Debits and credits will be swapped on today\'s date.', function () {
      var res = Accounting.reverseEntry(id);
      if (res.ok) { App.renderJournal(); Utils.toast('Reversing entry created', 'success'); }
      else Utils.toast(res.error, 'error');
    });
  };

  App.deleteEntryConfirm = function (id) {
    var e = Accounting.getEntry(id);
    if (!e) return;
    Utils.confirm('Delete Entry', 'Delete journal entry <strong>' + esc(e.reference || e.id) + '</strong>? Its lines will also be removed.', function () {
      Accounting.deleteEntry(id);
      App.renderJournal();
      Utils.toast('Entry deleted', 'success');
    });
  };

  /* ================= VIEW: LEDGER ================= */
  App.renderLedger = function () {
    var accId = $id('ledgerAccount').value;
    var from = $id('ledgerFrom').value, to = $id('ledgerTo').value;
    var acc = Accounting.getAccount(accId);
    if (!acc) {
      $id('ledgerTableBody').innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Select an account to view its ledger</td></tr>';
      $id('ledgerSummary').textContent = '';
      return;
    }
    var lg = Accounting.getLedger(accId, { from: from, to: to });
    var rows = lg.rows.map(function (r) {
      return '<tr><td>' + Utils.fmtDate(r.date) + '</td><td>' + esc(r.reference || '—') + '</td><td>' + esc(r.description) + '</td>' +
        '<td class="text-end">' + (r.debit ? Utils.fmtMoney(r.debit) : '') + '</td>' +
        '<td class="text-end">' + (r.credit ? Utils.fmtMoney(r.credit) : '') + '</td>' +
        '<td class="text-end fw-semibold">' + Utils.fmtMoney(r.balance) + '</td></tr>';
    });
    $id('ledgerTableBody').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="6" class="text-center text-muted py-4">No activity in this range</td></tr>';
    $id('ledgerSummary').innerHTML = '<strong>' + esc(acc.accountNumber + ' ' + acc.name) + '</strong> — Opening: ' + Utils.fmtMoney(lg.openingBalance) +
      ' · Debits: ' + Utils.fmtMoney(lg.totalDebit) + ' · Credits: ' + Utils.fmtMoney(lg.totalCredit) +
      ' · <span class="text-primary">Ending balance: ' + Utils.fmtMoney(lg.endingBalance) + '</span>';
  };

  /* ================= VIEW: TRIAL BALANCE ================= */
  App.renderTB = function () {
    var type = $id('tbType').value, asOf = $id('tbAsOf').value;
    var tb = Accounting.getTrialBalance({ type: type, asOf: asOf || undefined });
    var rows = tb.rows.map(function (r) {
      var name = r.account ? r.account.accountNumber + ' ' + r.account.name : r.label;
      return '<tr><td>' + esc(name) + '</td><td class="text-end">' + (r.debit ? Utils.fmtMoney(r.debit) : '') + '</td><td class="text-end">' + (r.credit ? Utils.fmtMoney(r.credit) : '') + '</td></tr>';
    });
    $id('tbTableBody').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="3" class="text-center text-muted py-4">No balances to display</td></tr>';
    $id('tbTotalDebit').textContent = Utils.fmtMoney(tb.totalDebit);
    $id('tbTotalCredit').textContent = Utils.fmtMoney(tb.totalCredit);
    var diff = $id('tbDiff');
    diff.textContent = tb.balanced ? '✓ Debits = Credits' : '✗ DIFFERENCE: ' + Utils.fmtMoney(tb.diff);
    diff.className = 'badge ' + (tb.balanced ? 'text-bg-success' : 'text-bg-danger');
  };

  /* ================= VIEW: RECONCILIATION ================= */
  App.renderRecon = function () {
    var from = $id('reconFrom').value, to = $id('reconTo').value;
    var entries = Accounting.getEntries().filter(function (e) {
      if (e.status === 'draft' || e.status === 'rejected') return false;
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var reconciled = 0;
    var rows = entries.map(function (e) {
      var t = Accounting.entryTotals(Accounting.entryLines(e.id));
      var isRec = Accounting.isReconciled(e.id);
      if (isRec) reconciled++;
      return '<tr><td><input type="checkbox" class="form-check-input recon-check" data-id="' + e.id + '" ' + (isRec ? 'checked disabled' : '') + '></td>' +
        '<td>' + Utils.fmtDate(e.date) + '</td><td>' + esc(e.reference || '—') + '</td><td>' + esc(e.description) + '</td>' +
        '<td class="text-end">' + Utils.fmtMoney(Math.max(t.debit, t.credit)) + '</td>' +
        '<td>' + (isRec ? '<span class="badge text-bg-success"><i class="bi bi-check2"></i> Reconciled</span>' : '<span class="badge text-bg-warning">Pending</span>') + '</td></tr>';
    });
    $id('reconTableBody').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="6" class="text-center text-muted py-4">No entries in this range</td></tr>';
    $id('reconSummary').textContent = reconciled + ' of ' + entries.length + ' entries reconciled';
  };

  App.markSelectedReconciled = function () {
    var ids = [];
    document.querySelectorAll('.recon-check:checked:not(:disabled)').forEach(function (cb) { ids.push(cb.getAttribute('data-id')); });
    if (!ids.length) { Utils.toast('Select entries to reconcile', 'warning'); return; }
    Accounting.markReconciled(ids);
    App.renderRecon();
    Utils.toast(ids.length + ' entries marked reconciled', 'success');
  };

  /* ================= VIEW: BUDGET ================= */
  App.renderBudget = function () {
    var period = $id('budgetPeriod').value;
    var bv = Accounting.getBudgetVariance(period);
    var rows = bv.rows.map(function (r) {
      var badge = r.hasBudget
        ? (r.favorable ? '<span class="badge text-bg-success">Favorable</span>' : '<span class="badge text-bg-danger">Unfavorable</span>')
        : '<span class="badge text-bg-secondary">No budget</span>';
      return '<tr><td>' + esc(r.account.accountNumber + ' ' + r.account.name) + '</td>' +
        '<td class="text-end">' + Utils.fmtMoney(r.budget) + '</td>' +
        '<td class="text-end">' + Utils.fmtMoney(r.actual) + '</td>' +
        '<td class="text-end ' + (r.variance < 0 ? 'text-danger' : 'text-success') + '">' + Utils.fmtMoney(r.variance) + '</td>' +
        '<td>' + badge + '</td></tr>';
    });
    $id('budgetTableBody').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="text-center text-muted py-4">No budget or activity for this period</td></tr>';
    Reports.renderBudgetReport();
  };

  App.openBudgetPrompt = function () {
    var accounts = Accounting.getAccounts().filter(function (a) { return a.type === 'Revenue' || a.type === 'Expense'; });
    if (!accounts.length) { Utils.toast('Create revenue/expense accounts first', 'warning'); return; }
    var modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'modalBudget';
    modal.setAttribute('tabindex', '-1');
    modal.innerHTML = '<div class="modal-dialog modal-fullscreen-mobile"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title">Set Budget</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '<div class="modal-body"><form id="budgetForm">' +
      '<div class="mb-2"><label class="form-label">Account</label><select class="form-select" id="budgetAccount">' + accounts.map(function (a) {
        return '<option value="' + a.id + '">' + esc(a.accountNumber + ' ' + a.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="mb-2"><label class="form-label">Period</label><input type="month" class="form-control" id="budgetPeriodInput" value="' + ($id('budgetPeriod').value || '') + '"></div>' +
      '<div class="mb-3"><label class="form-label">Budget Amount</label><input type="number" step="0.01" class="form-control" id="budgetAmountInput" placeholder="0.00" inputmode="decimal"></div>' +
      '<button type="submit" class="btn btn-primary w-100 btn-touch-large">Save Budget</button>' +
      '</form></div></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('hidden.bs.modal', function () { modal.remove(); });
    modal.querySelector('#budgetForm').addEventListener('submit', function (e) {
      e.preventDefault();
      Accounting.setBudget($id('budgetAccount').value, $id('budgetPeriodInput').value, $id('budgetAmountInput').value);
      bootstrap.Modal.getInstance(modal).hide();
      App.renderBudget();
      Utils.toast('Budget saved', 'success');
    });
    new bootstrap.Modal(modal).show();
  };

  /* ================= VIEW: PROFILE ================= */
  App.renderProfile = function () {
    var u = Auth.getCurrentUser();
    if (!u) return;
    $id('profileName').textContent = u.fullName;
    $id('profileUsername').textContent = u.username;
    $id('profileEmail').textContent = u.email;
    $id('profileRole').textContent = Permissions.roleLabel(u.role);
    $id('profileLastLogin').textContent = u.last_login ? Utils.fmtDateTime(u.last_login) : '—';
    $id('prefDateFormat').value = u.preferences.dateFormat;
    $id('prefCurrency').value = u.preferences.currency;
    $id('prefTheme').value = u.preferences.theme;
    $id('cpwResult').textContent = '';
  };

  App.savePrefs = function () {
    var u = Auth.getCurrentUser();
    if (!u) return;
    u.preferences.dateFormat = $id('prefDateFormat').value;
    u.preferences.currency = $id('prefCurrency').value;
    u.preferences.theme = $id('prefTheme').value;
    Auth.saveUser(u);
    App.setTheme(u.preferences.theme);
    $id('prefsResult').textContent = '✓ Saved';
    setTimeout(function () { $id('prefsResult').textContent = ''; }, 2500);
  };

  /* ================= THEME (light / dark / ocean / forest / rose / midnight / graphite) ================= */
  App.systemDark = function () {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  App.currentTheme = function () {
    var u = Auth.getCurrentUser();
    var t = (u && u.preferences.theme) || 'auto';
    if (t === 'auto') return App.systemDark() ? 'dark' : 'light';
    return t;
  };
  App.setTheme = function (theme) {
    theme = theme || 'auto';
    var u = Auth.getCurrentUser();
    if (u) { u.preferences.theme = theme; Auth.saveUser(u); }
    // data-theme always holds the *effective* theme; CSS tokens re-skin everything
    var effective = theme === 'auto' ? (App.systemDark() ? 'dark' : 'light') : theme;
    document.documentElement.setAttribute('data-theme', effective);
    document.body.classList.remove('dark-mode'); // legacy class no longer used
    // mark the active choice in the picker menu
    document.querySelectorAll('.theme-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-theme-choice') === theme);
    });
  };

  /* ================= IMPORT / EXPORT ================= */
  App.lastImport = null;

  App.handleImportFile = function (file, forcedType) {
    if (!file) return;
    var type = forcedType || $id('importType').value;
    var maxMb = Utils.getSettings().max_file_upload_size || 50;
    if (file.size > maxMb * 1024 * 1024) { Utils.toast('File exceeds ' + maxMb + ' MB limit', 'error'); return; }
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    var allowed = Utils.getSettings().allowed_file_types || ['csv', 'xlsx', 'xls'];
    if (allowed.indexOf(ext) < 0) { Utils.toast('File type .' + ext + ' not allowed', 'error'); return; }
    var prom;
    if (ext === 'csv') {
      prom = Utils.fileToText(file).then(function (text) {
        var rows = CSV.parseCSV(text);
        if (rows.length < 2) return { ok: false, error: 'File has no data rows' };
        var headers = rows[0];
        var objects = CSV.rowsToObjects(headers, rows.slice(1));
        return CSV.processImport(type, objects, { preview: true, source: file.name });
      });
    } else {
      prom = Excel.importExcelFile(file, type);
    }
    prom.then(function (res) {
      if (res && res.ok === false && res.error) { Utils.toast(res.error, 'error'); return; }
      if (!res) { Utils.toast('Import failed', 'error'); return; }
      App.lastImport = { type: type, objects: null, res: res, source: file.name };
      // re-run processImport without storing objects? processImport preview returns validRows inside res — use them for commit
      var area = $id('importPreviewArea');
      area.classList.remove('d-none');
      var body = $id('importPreviewBody');
      var html = '<tr><th class="small">Row</th>' + Object.keys(res.preview[0] || { _row: 1 }).map(function (k) { return '<th class="small">' + esc(k) + '</th>'; }).join('') + '</tr>';
      res.preview.forEach(function (p) {
        html += '<tr><td class="small text-muted">' + p._row + '</td>' + Object.keys(p).filter(function (k) { return k !== '_row'; }).map(function (k) { return '<td class="small">' + esc(p[k]) + '</td>'; }).join('') + '</tr>';
      });
      body.innerHTML = html;
      $id('importResult').innerHTML = '<div class="alert alert-' + (res.errorCount ? 'warning' : 'success') + ' py-2 small mb-2">' +
        'File: <strong>' + esc(file.name) + '</strong> — ' + res.total + ' row(s): ' + res.valid + ' valid, ' + res.errorCount + ' error(s).</div>';
      var errBtn = $id('btnDownloadErrors');
      errBtn.classList.toggle('d-none', !res.errorCount);
      Utils.toast(res.errorCount ? res.errorCount + ' rows need attention' : 'Preview ready', res.errorCount ? 'warning' : 'success');
    }).catch(function (e) {
      Utils.toast('Import failed: ' + e.message, 'error');
    });
  };

  App.commitImport = function () {
    var imp = App.lastImport;
    if (!imp) return;
    // commit the pre-validated rows captured during preview
    var commit = CSV.commitImport(imp.type, imp.res.validRows);
    if (commit.ok) {
      $id('importResult').innerHTML = '<div class="alert alert-success py-2 small mb-2">✓ Import committed: ' + commit.count + ' record(s)' +
        (commit.unmatched !== undefined ? ' matched; ' + commit.unmatched + ' statement line(s) unmatched' : '') + '.</div>';
      $id('importPreviewArea').classList.add('d-none');
      App.lastImport = null;
      App.refreshCurrentView();
      Utils.toast('Import committed', 'success');
    } else {
      $id('importResult').innerHTML = '<div class="alert alert-danger py-2 small">✗ ' + esc(commit.error) + '</div>';
      Utils.toast(commit.error, 'error');
    }
  };

  App.downloadImportErrors = function () {
    if (!App.lastImport) return;
    Utils.download('import-errors.csv', CSV.errorReport(App.lastImport.res.errors), 'text/csv');
  };

  /* ================= EVENT WIRING ================= */
  App.wireEvents = function () {
    // Nav
    document.addEventListener('click', function (e) {
      var navEl = e.target.closest ? e.target.closest('a[data-view]') : null;
      if (navEl) {
        e.preventDefault();
        var v = navEl.getAttribute('data-view');
        location.hash = '#/' + v;
        App.showView(v);
        return;
      }
      var actionEl = e.target.closest ? e.target.closest('[data-action]') : null;
      if (actionEl) {
        var action = actionEl.getAttribute('data-action');
        var id = actionEl.getAttribute('data-id');
        switch (action) {
          case 'edit-account': App.openAccountModal(id); break;
          case 'delete-account': App.deleteAccountConfirm(id); break;
          case 'view-entry': App.viewEntry(id); break;
          case 'edit-entry': App.openEntryModal(id); break;
          case 'approve-entry': App.approveEntryConfirm(id); break;
          case 'reverse-entry': App.reverseEntryConfirm(id); break;
          case 'delete-entry': App.deleteEntryConfirm(id); break;
          case 'edit-user': Admin.openEditUserModal(id); break;
          case 'delete-user': Admin.deleteUserConfirm(id); break;
          case 'toggle-user': Admin.toggleUserStatus(id); break;
          case 'resetpw-user': Admin.openResetPwModal(id); break;
          case 'activity-user': Admin.viewUserActivity(id); break;
          case 'impersonate-user': Admin.impersonateUser(id); break;
        }
        return;
      }
      var lineBtn = e.target.closest ? e.target.closest('.line-remove') : null;
      if (lineBtn) {
        var tr = lineBtn.closest('tr');
        if (tr) { tr.remove(); App.recalcEntryTotals(); }
        return;
      }
    });

    // Role change select
    document.addEventListener('change', function (e) {
      var sel = e.target.closest ? e.target.closest('select[data-action="role-user"]') : null;
      if (sel) { Admin.changeUserRole(sel.getAttribute('data-id'), sel.value); return; }
    });

    // Entry lines live totals
    $id('entryLinesBody').addEventListener('input', function (e) {
      if (e.target.classList.contains('line-debit') || e.target.classList.contains('line-credit')) App.recalcEntryTotals();
    });

    // Logout
    $id('btnLogout').addEventListener('click', function (e) {
      e.preventDefault();
      Utils.confirm('Logout', 'Sign out of the Accounting System?', function () { App.exitApp(); }, 'Logout');
    });
    $id('sidebarLogout').addEventListener('click', function (e) {
      e.preventDefault();
      Utils.confirm('Logout', 'Sign out of the Accounting System?', function () { App.exitApp(); }, 'Logout');
    });
    $id('btnStopImpersonation').addEventListener('click', Admin.stopImpersonation);

    // Account view controls
    $id('btnAddAccount').addEventListener('click', function () { App.openAccountModal(); });
    $id('accountForm').addEventListener('submit', App.submitAccountForm);
    $id('accountSearch').addEventListener('input', Utils.debounce(App.renderAccounts, 250));
    $id('accountTypeFilter').addEventListener('change', App.renderAccounts);
    $id('btnExportAccounts').addEventListener('click', function () { CSV.exportCSVFile('accounts'); });
    $id('btnImportAccounts').addEventListener('click', function () { $id('importType').value = 'accounts'; App.showView('data'); });
    $id('accType').addEventListener('change', function () {
      var t = this.value;
      $id('accNormalBalance').value = t === 'Asset' || t === 'Expense' ? 'Debit' : 'Credit';
    });

    // Journal view controls
    $id('btnAddEntry').addEventListener('click', function () { App.openEntryModal(); });
    $id('entryForm').addEventListener('submit', App.submitEntryForm);
    $id('btnAddLine').addEventListener('click', App.addEntryLine);
    $id('journalFrom').addEventListener('change', App.renderJournal);
    $id('journalTo').addEventListener('change', App.renderJournal);
    $id('journalSearch').addEventListener('input', Utils.debounce(App.renderJournal, 250));
    $id('btnExportJournal').addEventListener('click', function () { CSV.exportCSVFile('journal'); });
    $id('btnImportJournal').addEventListener('click', function () { $id('importType').value = 'journal'; App.showView('data'); });

    // Ledger
    $id('ledgerAccount').addEventListener('change', function () { App.populateAccountSelects(); App.renderLedger(); });
    $id('ledgerFrom').addEventListener('change', App.renderLedger);
    $id('ledgerTo').addEventListener('change', App.renderLedger);
    $id('btnExportLedger').addEventListener('click', function () { CSV.exportCSVFile('ledger'); });

    // Trial balance
    $id('tbType').addEventListener('change', App.renderTB);
    $id('tbAsOf').addEventListener('change', App.renderTB);
    $id('btnExportTB').addEventListener('click', function () { CSV.exportCSVFile('trial-balance'); });

    // Reports
    document.querySelectorAll('#reportTabs .nav-link').forEach(function (btn) {
      btn.addEventListener('click', function () { Reports.switchTab(this.getAttribute('data-report')); });
    });
    $id('btnRunPnl').addEventListener('click', Reports.renderPnl);
    $id('btnRunBs').addEventListener('click', Reports.renderBs);
    $id('btnRunCf').addEventListener('click', Reports.renderCf);
    $id('btnRunRe').addEventListener('click', Reports.renderRe);
    $id('btnRunCmp').addEventListener('click', Reports.renderCmp);
    $id('btnExportPnl').addEventListener('click', function () { Excel.exportReportExcel('pnl'); });
    $id('btnExportBs').addEventListener('click', function () { Excel.exportReportExcel('balance-sheet'); });
    $id('btnExportCf').addEventListener('click', function () { Excel.exportReportExcel('cash-flow'); });
    $id('btnExportRe').addEventListener('click', function () { Excel.exportReportExcel('retained'); });
    $id('btnExportCmp').addEventListener('click', function () { Excel.exportReportExcel('comparative'); });
    $id('btnExportStatements').addEventListener('click', function () { Excel.exportAllWorkbook(); });
    $id('btnPrintReport').addEventListener('click', Reports.print);
    $id('cfMethod').addEventListener('change', Reports.renderCf);

    // Reconciliation
    $id('reconFrom').addEventListener('change', App.renderRecon);
    $id('reconTo').addEventListener('change', App.renderRecon);
    $id('btnMarkReconciled').addEventListener('click', App.markSelectedReconciled);
    $id('btnImportBank').addEventListener('click', function () { $id('reconFile').click(); });
    $id('reconFile').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (f) App.handleImportFile(f, 'bank');
      e.target.value = '';
    });
    $id('btnExportRecon').addEventListener('click', function () {
      var rows = Accounting.getEntries().filter(function (e) { return e.status !== 'draft' && e.status !== 'rejected'; }).map(function (e) {
        var t = Accounting.entryTotals(Accounting.entryLines(e.id));
        return [e.date, e.reference, e.description, Math.max(t.debit, t.credit), Accounting.isReconciled(e.id) ? 'Reconciled' : 'Pending'];
      });
      CSV.downloadCSV('reconciliation-' + Utils.todayStr() + '.csv', ['Date', 'Reference', 'Description', 'Amount', 'Status'], rows);
    });

    // Budget
    $id('btnAddBudget').addEventListener('click', App.openBudgetPrompt);
    $id('budgetPeriod').addEventListener('change', App.renderBudget);
    $id('btnTemplateBudget').addEventListener('click', function () { Excel.downloadTemplate('budget'); });
    $id('btnImportBudget').addEventListener('click', function () { $id('importType').value = 'budget'; App.showView('data'); });
    $id('btnExportBudget').addEventListener('click', function () { Excel.exportReportExcel('budget'); });

    // Data view (import/export)
    $id('btnChooseFile').addEventListener('click', function () { $id('importFile').click(); });
    var dz = $id('dropZone');
    dz.addEventListener('click', function () { $id('importFile').click(); });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('dragover'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('dragover');
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) App.handleImportFile(f);
    });
    $id('importFile').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (f) App.handleImportFile(f);
      e.target.value = '';
    });
    $id('btnCommitImport').addEventListener('click', App.commitImport);
    $id('btnDownloadErrors').addEventListener('click', App.downloadImportErrors);
    $id('btnExportAll').addEventListener('click', function () { Excel.exportAllWorkbook(); });
    $id('btnExportAccountsX').addEventListener('click', function () { Excel.exportReportExcel('accounts'); });
    $id('btnExportJournalX').addEventListener('click', function () { Excel.exportReportExcel('journal'); });
    $id('btnExportTBX').addEventListener('click', function () { Excel.exportReportExcel('trial-balance'); });
    $id('btnExportLedgerX').addEventListener('click', function () { Excel.exportReportExcel('ledger'); });
    $id('btnExportStatementsX').addEventListener('click', function () { Excel.exportAllWorkbook(); });
    $id('btnExportAuditX').addEventListener('click', function () { Excel.exportAuditExcel(); });
    $id('btnExportUsersX').addEventListener('click', function () { Excel.exportUsersExcel(); });
    $id('btnTplAccounts').addEventListener('click', function () { Excel.downloadTemplate('accounts'); });
    $id('btnTplJournal').addEventListener('click', function () { Excel.downloadTemplate('journal'); });
    $id('btnTplBank').addEventListener('click', function () { Excel.downloadTemplate('bank'); });
    $id('btnTplBudget').addEventListener('click', function () { Excel.downloadTemplate('budget'); });

    // Users
    $id('btnAddUser').addEventListener('click', Admin.openAddUserModal);
    $id('userForm').addEventListener('submit', Admin.submitUserForm);
    $id('btnGenPassword').addEventListener('click', function () {
      var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
      var pw = '';
      for (var i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
      if (!/[A-Z]/.test(pw)) pw = 'A' + pw.slice(1);
      if (!/[0-9]/.test(pw)) pw = pw.slice(0, -1) + '7';
      if (!/[^A-Za-z0-9]/.test(pw)) pw += '!';
      $id('userPassword').value = pw;
    });
    $id('userSearch').addEventListener('input', Utils.debounce(Admin.renderUsers, 250));
    $id('userRoleFilter').addEventListener('change', Admin.renderUsers);
    $id('userStatusFilter').addEventListener('change', Admin.renderUsers);
    $id('resetPwForm').addEventListener('submit', Admin.submitResetPw);

    // Audit
    $id('btnApplyAudit').addEventListener('click', Admin.renderAudit);
    $id('btnExportAudit').addEventListener('click', Admin.exportAuditCSV);
    $id('btnClearAudit').addEventListener('click', Admin.clearAudit);
    $id('auditKeyword').addEventListener('keydown', function (e) { if (e.key === 'Enter') Admin.renderAudit(); });

    // Settings
    $id('settingsForm').addEventListener('submit', Admin.saveSettingsForm);

    // Data management
    $id('btnBackup').addEventListener('click', Admin.doBackup);
    $id('btnRestore').addEventListener('click', function () { $id('restoreFile').click(); });
    $id('restoreFile').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (f) Admin.doRestore(f);
      e.target.value = '';
    });
    $id('btnIntegrity').addEventListener('click', Admin.doIntegrityCheck);
    $id('btnCleanup').addEventListener('click', Admin.doCleanup);
    $id('btnImportSample').addEventListener('click', Admin.doImportSample);
    $id('btnExportUsersData').addEventListener('click', Admin.exportUsersData);

    // Profile
    $id('changePwForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var result;
      if ($id('cpwNew').value !== $id('cpwConfirm').value) {
        result = { ok: false, error: 'New passwords do not match' };
      } else {
        result = Auth.changePassword($id('cpwCurrent').value, $id('cpwNew').value);
      }
      $id('cpwResult').textContent = result.ok ? '✓ Password updated' : '✗ ' + result.error;
      $id('cpwResult').className = 'mt-2 small ' + (result.ok ? 'text-success' : 'text-danger');
      if (result.ok) e.target.reset();
    });
    $id('btnSavePrefs').addEventListener('click', App.savePrefs);

    // Theme picker (topbar dropdown)
    document.querySelectorAll('.theme-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var choice = this.getAttribute('data-theme-choice');
        App.setTheme(choice);
        Utils.toast('Theme: ' + choice.charAt(0).toUpperCase() + choice.slice(1), 'info');
      });
    });
    // Follow system theme changes while in "System" mode
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        var u = Auth.getCurrentUser();
        var t = (u && u.preferences.theme) || 'auto';
        if (t === 'auto') App.setTheme('auto');
      });
    }

    // Session extend
    $id('sessionExtend').addEventListener('click', function (e) {
      e.preventDefault();
      Auth.touchSession();
      var t = $id('sessionToast');
      if (t && global.bootstrap && bootstrap.Toast.getInstance(t)) bootstrap.Toast.getInstance(t).hide();
    });

    // Hash routing
    window.addEventListener('hashchange', function () {
      var name = (location.hash || '').replace('#/', '');
      if (name) App.showView(name);
    });
  };

  /* ================= INIT ================= */
  App.init = function () {
    Auth.seedDefaults();
    global.Mobile.init();
    App.initAuthUI();
    App.wireEvents();
    // theme (light / dark / system)
    var u = Auth.getCurrentUser();
    App.setTheme(u ? u.preferences.theme : 'auto');
    if (Auth.validateSession()) {
      Accounting.runDueRecurring();
      Audit.pruneLogs();
      App.enterApp();
    } else {
      $id('screenApp').classList.add('d-none');
      $id('screenAuth').classList.remove('d-none');
    }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', App.init);
    } else {
      App.init();
    }
  }

  global.App = App;
})(typeof window !== 'undefined' ? window : globalThis);
