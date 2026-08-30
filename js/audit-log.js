/* ============================================================
 * audit-log.js — Comprehensive audit trail for every user action
 * Namespace: window.Audit
 * ============================================================ */
(function (global) {
  'use strict';
  var Audit = {};
  var Utils = global.Utils;
  var K = Utils.K;

  // Action -> { type, entity, label } used for filters & display
  Audit.ACTION_CATALOG = {
    user_registered:           { type: 'auth',     label: 'User registered' },
    user_logged_in:            { type: 'auth',     label: 'User logged in' },
    user_logged_out:           { type: 'auth',     label: 'User logged out' },
    login_failed:              { type: 'auth',     label: 'Login failed' },
    password_reset_requested:  { type: 'auth',     label: 'Password reset requested' },
    password_changed:          { type: 'auth',     label: 'Password changed' },
    session_timeout:           { type: 'auth',     label: 'Session timeout' },
    user_created:              { type: 'admin',    label: 'User created (admin)' },
    user_updated:              { type: 'admin',    label: 'User updated (admin)' },
    user_deleted:              { type: 'admin',    label: 'User deleted (admin)' },
    user_disabled:             { type: 'admin',    label: 'User disabled (admin)' },
    user_enabled:              { type: 'admin',    label: 'User enabled (admin)' },
    user_role_changed:         { type: 'admin',    label: 'User role changed (admin)' },
    user_password_reset:       { type: 'admin',    label: 'User password reset (admin)' },
    impersonation_started:     { type: 'admin',    label: 'Impersonation started' },
    impersonation_ended:       { type: 'admin',    label: 'Impersonation ended' },
    account_created:           { type: 'accounting', label: 'Account created' },
    account_updated:           { type: 'accounting', label: 'Account updated' },
    account_deleted:           { type: 'accounting', label: 'Account deleted' },
    account_archived:          { type: 'accounting', label: 'Account archived' },
    journal_entry_created:     { type: 'accounting', label: 'Journal entry created' },
    journal_entry_updated:     { type: 'accounting', label: 'Journal entry updated' },
    journal_entry_deleted:     { type: 'accounting', label: 'Journal entry deleted' },
    journal_entry_reversed:    { type: 'accounting', label: 'Journal entry reversed' },
    journal_entry_approved:    { type: 'accounting', label: 'Journal entry approved' },
    journal_entry_rejected:    { type: 'accounting', label: 'Journal entry rejected' },
    data_imported:             { type: 'data',     label: 'Data imported' },
    data_exported:             { type: 'data',     label: 'Data exported' },
    data_backup_created:       { type: 'data',     label: 'Backup created' },
    data_restored:             { type: 'data',     label: 'Data restored' },
    budget_updated:            { type: 'accounting', label: 'Budget updated' },
    reconciliation_updated:    { type: 'accounting', label: 'Reconciliation updated' },
    report_generated:          { type: 'report',   label: 'Report generated' },
    report_exported:           { type: 'report',   label: 'Report exported' },
    system_settings_updated:   { type: 'system',   label: 'System settings updated' },
    system_health_check:       { type: 'system',   label: 'System health check' },
    storage_usage_check:       { type: 'system',   label: 'Storage usage check' },
    log_rotation:              { type: 'system',   label: 'Log rotation' },
    data_integrity_check:      { type: 'system',   label: 'Data integrity check' },
    orphan_cleanup:            { type: 'system',   label: 'Orphan record cleanup' },
    system_seeded:             { type: 'system',   label: 'System seeded' }
  };

  Audit.inferType = function (action) {
    var c = Audit.ACTION_CATALOG[action];
    if (c) return c.type;
    if (/create|add|new/.test(action)) return 'create';
    if (/delete|remove/.test(action)) return 'delete';
    if (/update|edit|change|reset/.test(action)) return 'update';
    if (/export|import/.test(action)) return 'data';
    if (/login|logout|auth|password/.test(action)) return 'auth';
    return 'system';
  };

  Audit.label = function (action) {
    var c = Audit.ACTION_CATALOG[action];
    return c ? c.label : action;
  };

  Audit.log = function (action, details, opts) {
    opts = opts || {};
    var user = (global.Auth && global.Auth.getCurrentUser()) || null;
    var session = (global.Auth && global.Auth.getSession()) || null;
    var rec = {
      id: 'log_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      timestamp: Utils.nowISO(),
      userId: user ? user.id : (opts.userId || 'system'),
      username: user ? user.username : 'system',
      userRole: user ? user.role : 'system',
      action: action,
      actionType: opts.actionType || Audit.inferType(action),
      entityType: opts.entityType || '',
      entityId: opts.entityId || '',
      details: details || '',
      ipAddress: Utils.simIp(),
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '',
      browser: Utils.detectBrowser(),
      device: Utils.detectDevice(),
      location: Utils.simLocation(),
      sessionId: session ? session.token : '',
      impersonatorId: (session && session.impersonating) ? session.impersonating.impersonatorId : null,
      success: opts.success !== false
    };
    var logs = Utils.loadData(K.AUDIT, []);
    logs.push(rec);
    Utils.saveData(K.AUDIT, logs.slice(-20000)); // cap at 20,000 records
    return rec;
  };

  Audit.getLogs = function (filters) {
    filters = filters || {};
    var logs = Utils.loadData(K.AUDIT, []);
    return logs.filter(function (l) {
      if (filters.userId && l.userId !== filters.userId) return false;
      if (filters.user && l.username !== filters.user) return false;
      if (filters.action && l.action !== filters.action) return false;
      if (filters.from && l.timestamp.slice(0, 10) < filters.from) return false;
      if (filters.to && l.timestamp.slice(0, 10) > filters.to) return false;
      if (filters.keyword) {
        var kw = filters.keyword.toLowerCase();
        var hay = (l.details + ' ' + l.username + ' ' + l.action + ' ' + l.entityId).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; });
  };

  Audit.getActionOptions = function () {
    return Object.keys(Audit.ACTION_CATALOG).sort();
  };

  Audit.getLogsForUser = function (userId) {
    return Audit.getLogs({ userId: userId }).slice(0, 200);
  };

  // Archive logs older than retention days (spec §6.4)
  Audit.pruneLogs = function () {
    var days = Utils.getSettings().log_retention_days || 90;
    var cutoff = new Date(Date.now() - days * 86400000).getTime();
    var logs = Utils.loadData(K.AUDIT, []);
    var keep = [], archive = [];
    logs.forEach(function (l) {
      if (new Date(l.timestamp).getTime() < cutoff) archive.push(l); else keep.push(l);
    });
    if (archive.length) {
      var existing = Utils.loadData(K.AUDIT_ARCHIVE, []);
      Utils.saveData(K.AUDIT_ARCHIVE, existing.concat(archive).slice(-50000));
      Utils.saveData(K.AUDIT, keep);
      Audit.log('log_rotation', 'Archived ' + archive.length + ' log records older than ' + days + ' days');
    }
    return archive.length;
  };

  // Admin only
  Audit.clearLogs = function () {
    var count = Utils.loadData(K.AUDIT, []).length;
    Utils.saveData(K.AUDIT, []);
    Audit.log('log_rotation', 'Cleared audit log (' + count + ' records)');
    return count;
  };

  global.Audit = Audit;
})(typeof window !== 'undefined' ? window : globalThis);
