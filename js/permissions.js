/* ============================================================
 * permissions.js — Role-based access control (Admin/Accountant/Viewer)
 * Namespace: window.Permissions
 * ============================================================ */
(function (global) {
  'use strict';
  var Permissions = {};

  Permissions.ROLES = ['admin', 'accountant', 'viewer'];

  // Permission matrix from spec §4.5
  Permissions.MATRIX = {
    view_dashboard:            { admin: true,  accountant: true,  viewer: true  },
    view_reports:              { admin: true,  accountant: true,  viewer: true  },
    view_ledger:               { admin: true,  accountant: true,  viewer: true  },
    view_trial_balance:        { admin: true,  accountant: true,  viewer: true  },
    view_financial_statements: { admin: true,  accountant: true,  viewer: true  },
    view_profile:              { admin: true,  accountant: true,  viewer: true  },
    create_account:            { admin: true,  accountant: true,  viewer: false },
    edit_account:              { admin: true,  accountant: true,  viewer: false },
    delete_account:            { admin: true,  accountant: true,  viewer: false },
    create_journal_entry:      { admin: true,  accountant: true,  viewer: false },
    edit_journal_entry:        { admin: true,  accountant: true,  viewer: false },
    delete_journal_entry:      { admin: true,  accountant: true,  viewer: false },
    import_data:               { admin: true,  accountant: true,  viewer: false },
    export_data:               { admin: true,  accountant: true,  viewer: false },
    manage_budget:             { admin: true,  accountant: true,  viewer: false },
    reconcile:                 { admin: true,  accountant: true,  viewer: false },
    manage_users:              { admin: true,  accountant: false, viewer: false },
    view_audit_log:            { admin: true,  accountant: false, viewer: false },
    system_settings:           { admin: true,  accountant: false, viewer: false },
    backup_restore:            { admin: true,  accountant: false, viewer: false },
    impersonate_user:          { admin: true,  accountant: false, viewer: false },
    delete_any_transaction:    { admin: true,  accountant: false, viewer: false }
  };

  Permissions.can = function (action) {
    var user = global.Auth ? global.Auth.getCurrentUser() : null;
    if (!user) return false;
    var row = Permissions.MATRIX[action];
    if (!row) return false;
    return !!row[user.role];
  };

  Permissions.roleLabel = function (role) {
    return { admin: 'Admin', accountant: 'Accountant', viewer: 'Viewer' }[role] || role;
  };

  global.Permissions = Permissions;
})(typeof window !== 'undefined' ? window : globalThis);
