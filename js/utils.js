/* ============================================================
 * utils.js — Shared utilities: storage, hashing, formatting, IDs
 * Namespace: window.Utils / globalThis.Utils
 * ============================================================ */
(function (global) {
  'use strict';
  var Utils = {};

  // ---- Storage keys (single source of truth across all modules) ----
  Utils.K = {
    USERS: 'acc_users',
    ACCOUNTS: 'acc_accounts',
    ENTRIES: 'acc_entries',
    LINES: 'acc_lines',
    AUDIT: 'acc_audit_log',
    AUDIT_ARCHIVE: 'acc_audit_archive',
    SETTINGS: 'acc_settings',
    SESSION: 'acc_session',
    LOGIN_HISTORY: 'acc_login_history',
    BUDGET: 'acc_budget',
    RECON: 'acc_reconciled',
    RECURRING: 'acc_recurring',
    META: 'acc_meta',
    LOCKOUT: 'acc_lockout',
    RESET_TOKENS: 'acc_reset_tokens'
  };

  Utils.DEFAULT_SETTINGS = {
    company_name: 'My Company',
    default_currency: 'USD',
    date_format: 'MM/DD/YYYY',
    timezone: 'UTC',
    fiscal_year_start: 'January',
    session_timeout: 30,
    max_login_attempts: 5,
    password_expiry_days: 90,
    enable_2fa: false,
    force_pw_change_first_login: false,
    auto_backup_frequency: 'none',
    backup_retention_days: 30,
    log_retention_days: 90,
    max_file_upload_size: 50,
    allowed_file_types: ['csv', 'xlsx', 'xls'],
    enable_notifications: true,
    in_app_notifications: true,
    critical_alerts: true
  };

  // ---- IDs & time ----
  Utils.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };
  Utils.nowISO = function () { return new Date().toISOString(); };
  Utils.todayStr = function () { return new Date().toISOString().slice(0, 10); };
  Utils.monthKey = function (dateStr) { return String(dateStr || '').slice(0, 7); };

  // ---- Storage ----
  Utils.loadData = function (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback !== undefined ? fallback : null;
      return JSON.parse(raw);
    } catch (e) { return fallback !== undefined ? fallback : null; }
  };
  Utils.saveData = function (key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.error('[storage] write failed for', key, e); return false; }
  };

  Utils.getSettings = function () {
    return Object.assign({}, Utils.DEFAULT_SETTINGS, Utils.loadData(Utils.K.SETTINGS, {}));
  };
  Utils.saveSettings = function (s) { return Utils.saveData(Utils.K.SETTINGS, s); };

  Utils.storageUsage = function () {
    var total = 0, keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('acc_') === 0) {
          var bytes = (localStorage.getItem(k) || '').length * 2;
          total += bytes;
          keys.push({ key: k, bytes: bytes });
        }
      }
    } catch (e) {}
    return { bytes: total, keys: keys };
  };
  Utils.formatBytes = function (b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  };

  // ---- Crypto ----
  Utils.hashPassword = function (password, salt) {
    if (typeof CryptoJS !== 'undefined') {
      return CryptoJS.SHA256(String(password) + String(salt)).toString();
    }
    return 'plain_' + String(password); // fallback outside browser
  };
  Utils.genSalt = function () {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  };

  // ---- Formatting ----
  Utils.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  Utils.fmtMoney = function (n, currency) {
    var cur = currency || Utils.getSettings().default_currency || 'USD';
    var v = Number(n) || 0;
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    } catch (e) { return cur + ' ' + v.toFixed(2); }
  };
  Utils.fmtNumber = function (n, dec) {
    var v = Number(n) || 0;
    var d = dec === undefined ? 2 : dec;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  Utils.fmtDate = function (dateStr) {
    if (!dateStr) return '';
    var s = String(dateStr);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    var fmt = Utils.getSettings().date_format || 'MM/DD/YYYY';
    if (fmt === 'DD/MM/YYYY') return m[3] + '/' + m[2] + '/' + m[1];
    if (fmt === 'YYYY-MM-DD') return s.slice(0, 10);
    return m[2] + '/' + m[3] + '/' + m[1];
  };
  Utils.fmtDateTime = function (iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso), pad = function (n) { return n < 10 ? '0' + n : n; };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return iso; }
  };
  Utils.parseMoney = function (v) {
    if (typeof v === 'number') return v;
    if (v == null || v === '') return 0;
    var s = String(v).replace(/[^0-9.\-]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  Utils.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 300);
    };
  };

  // ---- Simulated client info (no backend, so synthesized) ----
  Utils.simIp = function () {
    var seed = (Date.now() % 9973);
    return '192.168.' + ((seed * 7) % 250) + '.' + ((seed % 240) + 1);
  };
  Utils.simLocation = function () {
    var locs = ['San Francisco, CA', 'New York, NY', 'London, UK', 'Singapore', 'Sydney, AU', 'Berlin, DE', 'Tokyo, JP', 'Toronto, CA'];
    return locs[Math.floor(Math.random() * locs.length)] + ' (simulated)';
  };
  Utils.detectBrowser = function () {
    var ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/Edg\//.test(ua)) return 'Edge';
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/iPhone|iPad|iPod/.test(ua)) return 'Mobile Safari';
    if (/Safari\//.test(ua)) return 'Safari';
    return 'Unknown';
  };
  Utils.detectDevice = function () {
    var ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/iPhone/.test(ua)) {
      var m = ua.match(/iPhone OS (\d+)_(\d+)/);
      return m ? 'iPhone ' + m[1] + '.' + m[2] : 'iPhone';
    }
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    return 'Desktop';
  };

  // ---- UI helpers ----
  Utils.toast = function (msg, type) {
    if (typeof window === 'undefined') { console.log('[toast]', msg); return; }
    var colors = { success: 'text-bg-success', error: 'text-bg-danger', warning: 'text-bg-warning', info: 'text-bg-info' };
    var cls = colors[type] || 'text-bg-secondary';
    var el = document.createElement('div');
    el.className = 'toast align-items-center border-0 ' + cls;
    el.setAttribute('role', 'alert');
    el.innerHTML = '<div class="d-flex"><div class="toast-body">' + Utils.escapeHtml(msg) + '</div><button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button></div>';
    var container = document.querySelector('.toast-container');
    if (!container) { container = document.createElement('div'); container.className = 'toast-container position-fixed top-0 end-0 p-3'; document.body.appendChild(container); }
    container.appendChild(el);
    if (global.bootstrap) {
      var t = new bootstrap.Toast(el, { delay: 3500 });
      t.show();
      el.addEventListener('hidden.bs.toast', function () { el.remove(); });
    } else { setTimeout(function () { el.remove(); }, 4000); }
  };

  Utils.download = function (filename, content, mime) {
    try {
      var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      if (typeof saveAs === 'function') { saveAs(blob, filename); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
    } catch (e) { console.error('download failed', e); }
  };

  Utils.fileToText = function (file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsText(file);
    });
  };
  Utils.fileToArrayBuffer = function (file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsArrayBuffer(file);
    });
  };

  // Generic confirm dialog wired to #modalConfirm
  Utils.confirm = function (title, message, onOk, okLabel) {
    if (typeof window === 'undefined') { onOk && onOk(); return; }
    var m = document.getElementById('modalConfirm');
    if (!m) { if (window.confirm(message)) onOk && onOk(); return; }
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').innerHTML = message;
    var btn = document.getElementById('confirmOkBtn');
    btn.textContent = okLabel || 'Yes';
    btn.onclick = function () {
      var inst = bootstrap.Modal.getInstance(m) || new bootstrap.Modal(m);
      inst.hide();
      onOk && onOk();
    };
    (bootstrap.Modal.getInstance(m) || new bootstrap.Modal(m)).show();
  };

  global.Utils = Utils;
})(typeof window !== 'undefined' ? window : globalThis);
