/* ============================================================
 * admin.js — Admin panel: user management, audit log view,
 * system settings, data management, impersonation.
 * Namespace: window.Admin
 * ============================================================ */
(function (global) {
  'use strict';
  var Admin = {};
  var Utils = global.Utils;
  var Audit = global.Audit;
  var Auth = global.Auth;
  var Permissions = global.Permissions;
  var Accounting = global.Accounting;
  var CSV = global.CSV;

  function $id(id) { return document.getElementById(id); }

  /* ---------------- Role-based UI visibility ---------------- */
  Admin.updateAdminUI = function () {
    var isAdmin = Permissions.can('manage_users');
    document.querySelectorAll('.admin-only').forEach(function (el) {
      el.classList.toggle('d-none', !isAdmin);
    });
    var user = Auth.getCurrentUser();
    if ($id('topbarRole')) $id('topbarRole').textContent = Permissions.roleLabel(user ? user.role : '');
    if ($id('topbarUser')) $id('topbarUser').textContent = user ? user.username : '';
    // hide admin-only action buttons in views for non-admins
    document.querySelectorAll('.admin-action').forEach(function (el) {
      el.classList.toggle('d-none', !isAdmin);
    });
    Admin.updateImpersonationUI();
  };

  Admin.updateImpersonationUI = function () {
    var banner = $id('impersonationBanner');
    if (!banner) return;
    var imp = Auth.isImpersonating();
    banner.classList.toggle('d-none', !imp);
    if (imp) {
      var s = Auth.getSession();
      $id('impersonationUser').textContent = s.impersonating.username;
    }
  };

  /* ---------------- USER MANAGEMENT ---------------- */
  Admin.userSort = { key: 'username', dir: 1 };

  Admin.renderUsers = function () {
    if (!Permissions.can('manage_users')) return;
    var q = ($id('userSearch').value || '').toLowerCase();
    var roleF = $id('userRoleFilter').value;
    var statusF = $id('userStatusFilter').value;
    var users = Auth.allUsers().filter(function (u) {
      if (q && (u.username + ' ' + u.fullName + ' ' + u.email).toLowerCase().indexOf(q) === -1) return false;
      if (roleF && u.role !== roleF) return false;
      if (statusF && u.status !== statusF) return false;
      return true;
    });
    var key = Admin.userSort.key, dir = Admin.userSort.dir;
    users.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (key === 'created_at' || key === 'last_login') {
        av = av || ''; bv = bv || '';
        return av < bv ? -dir : av > bv ? dir : 0;
      }
      av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase();
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    var rows = users.map(function (u) {
      var roleBadge = { admin: 'text-bg-danger', accountant: 'text-bg-primary', viewer: 'text-bg-secondary' }[u.role] || 'text-bg-secondary';
      var statusBadge = u.status === 'active' ? 'text-bg-success' : 'text-bg-secondary';
      var me = Auth.getCurrentUser() && Auth.getCurrentUser().id === u.id;
      return '<tr>' +
        '<td><code>' + Utils.escapeHtml(u.id) + '</code></td>' +
        '<td>' + Utils.escapeHtml(u.username) + (me ? ' <span class="badge text-bg-info">you</span>' : '') + '</td>' +
        '<td>' + Utils.escapeHtml(u.email) + '</td>' +
        '<td><select class="form-select form-select-sm w-auto" data-action="role-user" data-id="' + u.id + '" title="Change role">' +
          ['admin', 'accountant', 'viewer'].map(function (r) { return '<option value="' + r + '"' + (r === u.role ? ' selected' : '') + '>' + Permissions.roleLabel(r) + '</option>'; }).join('') +
        '</select></td>' +
        '<td><button class="btn btn-sm btn-touch ' + (u.status === 'active' ? 'btn-outline-success' : 'btn-outline-secondary') + '" data-action="toggle-user" data-id="' + u.id + '"><span class="badge ' + statusBadge + '">' + u.status + '</span></button></td>' +
        '<td>' + Utils.fmtDate(u.created_at.slice(0, 10)) + '</td>' +
        '<td>' + (u.last_login ? Utils.fmtDateTime(u.last_login) : '—') + '</td>' +
        '<td class="text-end text-nowrap">' +
          '<button class="btn btn-sm btn-outline-primary btn-touch" data-action="activity-user" data-id="' + u.id + '" title="Activity"><i class="bi bi-clock-history"></i></button> ' +
          '<button class="btn btn-sm btn-outline-warning btn-touch" data-action="impersonate-user" data-id="' + u.id + '" title="Impersonate"><i class="bi bi-eye"></i></button> ' +
          '<button class="btn btn-sm btn-outline-primary btn-touch" data-action="edit-user" data-id="' + u.id + '" title="Edit"><i class="bi bi-pencil"></i></button> ' +
          '<button class="btn btn-sm btn-outline-danger btn-touch" data-action="resetpw-user" data-id="' + u.id + '" title="Reset password"><i class="bi bi-key"></i></button> ' +
          '<button class="btn btn-sm btn-outline-danger btn-touch" data-action="delete-user" data-id="' + u.id + '" title="Delete"><i class="bi bi-trash"></i></button>' +
        '</td></tr>';
    });
    $id('usersTableBody').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="8" class="text-center text-muted py-4">No users match the current filters</td></tr>';
  };

  Admin.openAddUserModal = function () {
    $id('userModalTitle').textContent = 'Add User';
    $id('userForm').reset();
    $id('userId').value = '';
    $id('userPasswordGroup').style.display = '';
    $id('userWelcomeGroup').style.display = '';
    $id('userForceGroup').classList.remove('d-none');
    $id('userModalError').classList.add('d-none');
    new bootstrap.Modal($id('modalUser')).show();
  };

  Admin.openEditUserModal = function (id) {
    var u = Auth.getUser(id);
    if (!u) return;
    $id('userModalTitle').textContent = 'Edit User — ' + u.username;
    $id('userId').value = u.id;
    $id('userFullName').value = u.fullName;
    $id('userEmail').value = u.email;
    $id('userUsername').value = u.username;
    $id('userUsername').disabled = true;
    $id('userPasswordGroup').style.display = 'none';
    $id('userWelcomeGroup').style.display = 'none';
    $id('userForceGroup').classList.remove('d-none');
    $id('userRole').value = u.role;
    $id('userStatus').value = u.status;
    $id('userForceReset').checked = false;
    $id('userModalError').classList.add('d-none');
    new bootstrap.Modal($id('modalUser')).show();
  };

  Admin.submitUserForm = function (e) {
    e.preventDefault();
    var id = $id('userId').value;
    var fullName = $id('userFullName').value.trim();
    var email = $id('userEmail').value.trim();
    var username = $id('userUsername').value.trim();
    var role = $id('userRole').value;
    var status = $id('userStatus').value;
    var err = $id('userModalError');
    var showErr = function (msg) { err.textContent = msg; err.classList.remove('d-none'); };

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr('Valid email is required');
    if (id) {
      var u = Auth.getUser(id);
      if (!u) return;
      var oldRole = u.role;
      var oldStatus = u.status;
      u.fullName = fullName;
      u.email = email;
      u.role = role;
      u.status = status;
      if ($id('userForceReset').checked) { u.force_pw_change = true; }
      Auth.saveUser(u);
      Audit.log('user_updated', 'Admin updated user ' + u.username + ' (role: ' + role + ', status: ' + status + ')', { entityType: 'user', entityId: id });
      if (oldRole !== role) Audit.log('user_role_changed', 'Role changed for ' + u.username + ': ' + oldRole + ' → ' + role, { entityType: 'user', entityId: id });
      if (oldStatus !== status) Audit.log(status === 'active' ? 'user_enabled' : 'user_disabled', 'Status changed for ' + u.username + ': ' + oldStatus + ' → ' + status, { entityType: 'user', entityId: id });
    } else {
      var pw = $id('userPassword').value;
      if (Auth.usernameExists(username)) return showErr('Username already taken');
      if (Auth.emailExists(email)) return showErr('Email already registered');
      var pwErrors = Auth.validatePassword(pw);
      if (pwErrors.length) return showErr('Password must include: ' + pwErrors.join(', '));
      var newUser = Auth.createUserInternal({ username: username, email: email, fullName: fullName, password: pw, role: role, status: status, force_pw_change: $id('userForceReset').checked });
      Audit.log('user_created', 'Admin created user ' + newUser.username + ' (' + role + ')', { entityType: 'user', entityId: newUser.id });
      if ($id('userWelcome').checked) {
        console.log('[SIMULATED EMAIL] Welcome email sent to ' + email);
        Utils.toast('Welcome email simulated (see console)', 'info');
      }
    }
    bootstrap.Modal.getInstance($id('modalUser')).hide();
    Admin.renderUsers();
    Utils.toast('User saved', 'success');
  };

  Admin.deleteUserConfirm = function (id) {
    var u = Auth.getUser(id);
    if (!u) return;
    if (Auth.getCurrentUser() && Auth.getCurrentUser().id === id) { Utils.toast('You cannot delete your own account', 'error'); return; }
    Utils.confirm('Delete User', 'Delete user <strong>' + Utils.escapeHtml(u.username) + '</strong> (' + u.email + ')?<br><small class="text-danger">Their stored accounting data will remain in localStorage but become inaccessible.</small>', function () {
      Auth.deleteUser(id);
      Audit.log('user_deleted', 'Admin deleted user ' + u.username, { entityType: 'user', entityId: id });
      Admin.renderUsers();
      Utils.toast('User deleted', 'success');
    });
  };

  Admin.toggleUserStatus = function (id) {
    var u = Auth.getUser(id);
    if (!u) return;
    if (Auth.getCurrentUser() && Auth.getCurrentUser().id === id) { Utils.toast('You cannot disable your own account', 'error'); return; }
    u.status = u.status === 'active' ? 'inactive' : 'active';
    Auth.saveUser(u);
    Audit.log(u.status === 'active' ? 'user_enabled' : 'user_disabled', 'Admin ' + (u.status === 'active' ? 'enabled' : 'disabled') + ' user ' + u.username, { entityType: 'user', entityId: id });
    Admin.renderUsers();
  };

  Admin.changeUserRole = function (id, role) {
    var u = Auth.getUser(id);
    if (!u) return;
    if (Auth.getCurrentUser() && Auth.getCurrentUser().id === id) { Utils.toast('You cannot change your own role', 'error'); return; }
    var old = u.role;
    u.role = role;
    Auth.saveUser(u);
    Audit.log('user_role_changed', 'Role changed for ' + u.username + ': ' + old + ' → ' + role, { entityType: 'user', entityId: id });
    Admin.renderUsers();
    Utils.toast('Role updated', 'success');
  };

  Admin.openResetPwModal = function (id) {
    var u = Auth.getUser(id);
    if (!u) return;
    $id('resetPwUserId').value = id;
    $id('resetPwNew').value = '';
    $id('resetPwConfirm').value = '';
    $id('resetPwError').classList.add('d-none');
    new bootstrap.Modal($id('modalResetPw')).show();
  };

  Admin.submitResetPw = function (e) {
    e.preventDefault();
    var id = $id('resetPwUserId').value;
    var pw = $id('resetPwNew').value;
    var confirm = $id('resetPwConfirm').value;
    var err = $id('resetPwError');
    if (pw !== confirm) { err.textContent = 'Passwords do not match'; err.classList.remove('d-none'); return; }
    var res = Auth.adminResetPassword(id, pw);
    if (!res.ok) { err.textContent = res.error; err.classList.remove('d-none'); return; }
    bootstrap.Modal.getInstance($id('modalResetPw')).hide();
    Utils.toast('Password reset. User must change it on next login.', 'success');
  };

  Admin.viewUserActivity = function (id) {
    var u = Auth.getUser(id);
    if (!u) return;
    $id('userActivityTitle').textContent = 'Activity — ' + u.username;
    var logs = Audit.getLogsForUser(id);
    $id('userActivityBody').innerHTML = logs.length ? logs.map(function (l) {
      return '<tr><td>' + Utils.fmtDateTime(l.timestamp) + '</td><td><span class="badge text-bg-light border">' + Utils.escapeHtml(l.action) + '</span></td><td>' + Utils.escapeHtml(l.details) + '</td></tr>';
    }).join('') : '<tr><td colspan="3" class="text-center text-muted">No activity recorded</td></tr>';
    new bootstrap.Modal($id('modalUserActivity')).show();
  };

  Admin.impersonateUser = function (id) {
    var u = Auth.getUser(id);
    if (!u) return;
    if (Auth.getCurrentUser() && Auth.getCurrentUser().id === id) { Utils.toast('You are already this user', 'info'); return; }
    Utils.confirm('Impersonate User', 'Switch to <strong>' + Utils.escapeHtml(u.username) + '</strong>? You will see and operate their data. Everything is logged.', function () {
      var res = Auth.startImpersonation(id);
      if (res.ok) {
        Admin.updateImpersonationUI();
        global.App.enterApp();
        Utils.toast('Now impersonating ' + u.username, 'warning');
      } else {
        Utils.toast(res.error, 'error');
      }
    });
  };

  Admin.stopImpersonation = function () {
    Auth.stopImpersonation();
    Admin.updateImpersonationUI();
    global.App.enterApp();
    Utils.toast('Returned to your own account', 'success');
  };

  /* ---------------- AUDIT LOG ---------------- */
  Admin.auditFilters = {};

  Admin.initAuditFilters = function () {
    var usersSel = $id('auditUser');
    if (usersSel.options.length <= 1) {
      usersSel.innerHTML = '<option value="">All Users</option>' + Auth.allUsers().map(function (u) { return '<option value="' + Utils.escapeHtml(u.username) + '">' + Utils.escapeHtml(u.username) + '</option>'; }).join('');
    }
    var actSel = $id('auditAction');
    if (actSel.options.length <= 1) {
      actSel.innerHTML = '<option value="">All Actions</option>' + Audit.getActionOptions().map(function (a) { return '<option value="' + Utils.escapeHtml(a) + '">' + Utils.escapeHtml(Audit.label(a)) + '</option>'; }).join('');
    }
  };

  Admin.renderAudit = function () {
    if (!Permissions.can('view_audit_log')) return;
    var f = {
      user: $id('auditUser').value,
      action: $id('auditAction').value,
      from: $id('auditFrom').value,
      to: $id('auditTo').value,
      keyword: $id('auditKeyword').value
    };
    var logs = Audit.getLogs(f);
    var rows = logs.slice(0, 500).map(function (l) {
      var typeBadge = { auth: 'text-bg-secondary', admin: 'text-bg-danger', accounting: 'text-bg-primary', data: 'text-bg-info', report: 'text-bg-warning', system: 'text-bg-dark' }[l.actionType] || 'text-bg-light';
      return '<tr>' +
        '<td class="text-nowrap small">' + Utils.fmtDateTime(l.timestamp) + '</td>' +
        '<td>' + Utils.escapeHtml(l.username) + (l.impersonatorId ? ' <i class="bi bi-eye text-danger" title="during impersonation"></i>' : '') + '</td>' +
        '<td>' + Utils.escapeHtml(l.userRole) + '</td>' +
        '<td><span class="badge ' + typeBadge + '">' + Utils.escapeHtml(l.action) + '</span></td>' +
        '<td class="small">' + Utils.escapeHtml(l.details) + '</td>' +
        '<td class="small text-nowrap">' + l.ipAddress + '</td>' +
        '<td class="small">' + Utils.escapeHtml(l.device) + ' · ' + Utils.escapeHtml(l.browser) + '</td>' +
        '</tr>';
    });
    $id('auditTableBody').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="7" class="text-center text-muted py-4">No log entries match the filters</td></tr>';
    $id('auditSummary').textContent = logs.length + ' log record(s)' + (logs.length > 500 ? ' (showing first 500)' : '');
  };

  Admin.exportAuditCSV = function () {
    var f = {
      user: $id('auditUser').value, action: $id('auditAction').value,
      from: $id('auditFrom').value, to: $id('auditTo').value, keyword: $id('auditKeyword').value
    };
    var logs = Audit.getLogs(f);
    CSV.downloadCSV('audit-log-' + Utils.todayStr() + '.csv',
      ['Timestamp', 'User', 'Role', 'Action', 'Details', 'IP', 'Browser', 'Device', 'Location'],
      logs.map(function (l) { return [l.timestamp, l.username, l.userRole, l.action, l.details, l.ipAddress, l.browser, l.device, l.location]; }));
    Audit.log('data_exported', 'Exported audit log to CSV (' + logs.length + ' records)', { entityType: 'audit' });
  };

  Admin.clearAudit = function () {
    Utils.confirm('Clear Audit Log', 'Delete all audit log records? This action is logged and cannot be undone.', function () {
      var count = Audit.clearLogs();
      Admin.renderAudit();
      Utils.toast('Cleared ' + count + ' log records', 'success');
    });
  };

  /* ---------------- SETTINGS ---------------- */
  Admin.fillSettingsForm = function () {
    var s = Utils.getSettings();
    $id('setCompanyName').value = s.company_name;
    $id('setCurrency').value = s.default_currency;
    $id('setDateFormat').value = s.date_format;
    $id('setTimezone').value = s.timezone;
    $id('setFiscalStart').value = s.fiscal_year_start;
    $id('setSessionTimeout').value = s.session_timeout;
    $id('setMaxLoginAttempts').value = s.max_login_attempts;
    $id('setPasswordExpiry').value = s.password_expiry_days;
    $id('setEnable2FA').checked = !!s.enable_2fa;
    $id('setForcePwChange').checked = !!s.force_pw_change_first_login;
    $id('setAutoBackup').value = s.auto_backup_frequency;
    $id('setBackupRetention').value = s.backup_retention_days;
    $id('setLogRetention').value = s.log_retention_days;
    $id('setMaxUpload').value = s.max_file_upload_size;
    $id('setAllowCsv').checked = s.allowed_file_types.indexOf('csv') >= 0;
    $id('setAllowXlsx').checked = s.allowed_file_types.indexOf('xlsx') >= 0;
    $id('setAllowXls').checked = s.allowed_file_types.indexOf('xls') >= 0;
    $id('setEnableNotifications').checked = !!s.enable_notifications;
    $id('setInAppNotif').checked = s.in_app_notifications !== false;
    $id('setCriticalAlerts').checked = !!s.critical_alerts;
  };

  Admin.saveSettingsForm = function (e) {
    e.preventDefault();
    var allowed = [];
    if ($id('setAllowCsv').checked) allowed.push('csv');
    if ($id('setAllowXlsx').checked) allowed.push('xlsx');
    if ($id('setAllowXls').checked) allowed.push('xls');
    var s = {
      company_name: $id('setCompanyName').value.trim() || 'My Company',
      default_currency: $id('setCurrency').value,
      date_format: $id('setDateFormat').value,
      timezone: $id('setTimezone').value || 'UTC',
      fiscal_year_start: $id('setFiscalStart').value,
      session_timeout: parseInt($id('setSessionTimeout').value, 10) || 30,
      max_login_attempts: parseInt($id('setMaxLoginAttempts').value, 10) || 5,
      password_expiry_days: parseInt($id('setPasswordExpiry').value, 10) || 90,
      enable_2fa: $id('setEnable2FA').checked,
      force_pw_change_first_login: $id('setForcePwChange').checked,
      auto_backup_frequency: $id('setAutoBackup').value,
      backup_retention_days: parseInt($id('setBackupRetention').value, 10) || 30,
      log_retention_days: parseInt($id('setLogRetention').value, 10) || 90,
      max_file_upload_size: parseInt($id('setMaxUpload').value, 10) || 50,
      allowed_file_types: allowed.length ? allowed : ['csv'],
      enable_notifications: $id('setEnableNotifications').checked,
      in_app_notifications: $id('setInAppNotif').checked,
      critical_alerts: $id('setCriticalAlerts').checked
    };
    Utils.saveSettings(s);
    Audit.log('system_settings_updated', 'System settings updated by admin', { entityType: 'settings' });
    $id('settingsResult').textContent = '✓ Saved';
    setTimeout(function () { $id('settingsResult').textContent = ''; }, 2500);
    Utils.toast('Settings saved', 'success');
  };

  /* ---------------- DATA MANAGEMENT ---------------- */
  Admin.updateStorageInfo = function () {
    var usage = Utils.storageUsage();
    $id('storageInfo').textContent = 'Storage: ' + Utils.formatBytes(usage.bytes) + ' across ' + usage.keys.length + ' collections. Data lives only in this browser (localStorage).';
  };

  Admin.doBackup = function () {
    var data = Accounting.getAllData();
    Utils.download('accounting-backup-' + Utils.todayStr() + '.json', JSON.stringify(data, null, 2), 'application/json');
    Audit.log('data_backup_created', 'System backup created (JSON export)', { entityType: 'backup' });
    Utils.toast('Backup downloaded', 'success');
  };

  Admin.doRestore = function (file) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { Utils.toast('File too large', 'error'); return; }
    Utils.fileToText(file).then(function (text) {
      var json;
      try { json = JSON.parse(text); } catch (e) { Utils.toast('Invalid JSON backup file', 'error'); return; }
      Utils.confirm('Restore Backup', 'This will REPLACE all current data with the backup contents. Continue?', function () {
        var res = Accounting.restoreAllData(json);
        if (res.ok) {
          Utils.toast('Backup restored: ' + res.counts.users + ' users, ' + res.counts.accounts + ' accounts, ' + res.counts.entries + ' entries', 'success');
          global.App.enterApp();
        } else {
          Utils.toast(res.error, 'error');
        }
      }, 'Restore');
    }).catch(function () { Utils.toast('Could not read file', 'error'); });
  };

  Admin.doIntegrityCheck = function () {
    var issues = Accounting.integrityCheck();
    var html = '<h6 class="fw-bold">Integrity Check</h6>';
    if (!issues.length) {
      html += '<div class="alert alert-success py-2">No issues found — all records are consistent.</div>';
    } else {
      var errors = issues.filter(function (i) { return i.severity === 'error'; }).length;
      var warns = issues.filter(function (i) { return i.severity === 'warn'; }).length;
      html += '<div class="alert alert-' + (errors ? 'danger' : 'warning') + ' py-2">' + errors + ' error(s), ' + warns + ' warning(s)</div><ul class="small">';
      issues.slice(0, 30).forEach(function (i) {
        html += '<li>' + i.severity + ': ' + Utils.escapeHtml(i.detail) + '</li>';
      });
      if (issues.length > 30) html += '<li>… and ' + (issues.length - 30) + ' more</li>';
      html += '</ul>';
    }
    $id('dataMgmtResult').innerHTML = html;
    Audit.log('data_integrity_check', 'Data integrity check run: ' + issues.length + ' issue(s) found', { entityType: 'system' });
  };

  Admin.doCleanup = function () {
    Utils.confirm('Orphan Cleanup', 'Remove orphan line records that reference missing entries/accounts?', function () {
      var removed = Accounting.cleanupOrphans();
      $id('dataMgmtResult').innerHTML = '<div class="alert alert-success py-2">Removed ' + removed + ' orphan record(s).</div>';
      Utils.toast('Cleanup complete', 'success');
    });
  };

  Admin.doImportSample = function () {
    Utils.confirm('Import Sample Data', 'Load the built-in sample chart of accounts and 3 months of transactions for the current user?<br><small>Only works when the user has no accounts yet.</small>', function () {
      var res = Accounting.loadSampleData();
      $id('dataMgmtResult').innerHTML = '<div class="alert alert-' + (res.ok ? 'success' : 'warning') + ' py-2">' + Utils.escapeHtml(res.ok ? 'Sample data loaded successfully.' : res.error) + '</div>';
      if (res.ok) global.App.refreshCurrentView();
    });
  };

  Admin.exportUsersData = function () {
    var data = Accounting.getAllData();
    Utils.download('all-user-data-' + Utils.todayStr() + '.json', JSON.stringify(data, null, 2), 'application/json');
    Audit.log('data_exported', 'Exported all user data (JSON)', { entityType: 'backup' });
    Utils.toast('All user data exported', 'success');
  };

  global.Admin = Admin;
})(typeof window !== 'undefined' ? window : globalThis);
