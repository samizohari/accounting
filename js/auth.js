/* ============================================================
 * auth.js — Authentication: registration, login, lockout,
 * sessions (30-min idle timeout), password rules, impersonation,
 * login history, default user seeding.
 * Namespace: window.Auth
 * ============================================================ */
(function (global) {
  'use strict';
  var Auth = {};
  var Utils = global.Utils;
  var Audit = global.Audit;
  var Permissions = global.Permissions;
  var K = Utils.K;

  var DEFAULT_USERS = [
    { username: 'admin',      email: 'admin@accounting.com',      password: 'Admin@123', fullName: 'System Administrator', role: 'admin' },
    { username: 'accountant', email: 'accountant@accounting.com', password: 'Acc@123',   fullName: 'Head Accountant',      role: 'accountant' },
    { username: 'viewer',     email: 'viewer@accounting.com',     password: 'View@123',  fullName: 'Read Only Viewer',      role: 'viewer' }
  ];

  /* ---------------- Seeding ---------------- */
  Auth.seedDefaults = function () {
    var meta = Utils.loadData(K.META, {});
    if (meta.seeded && Utils.loadData(K.USERS, []).length) return Utils.getSettings();
    var users = Utils.loadData(K.USERS, []);
    if (!users.length) {
      DEFAULT_USERS.forEach(function (u) { Auth.createUserInternal(u); });
      Audit.log('system_seeded', 'Seeded default users (admin, accountant, viewer)');
    }
    meta.seeded = true;
    Utils.saveData(K.META, meta);
    if (!Utils.loadData(K.SETTINGS, null)) Utils.saveSettings(Utils.DEFAULT_SETTINGS);
    return Utils.getSettings();
  };

  Auth.createUserInternal = function (data) {
    var salt = Utils.genSalt();
    var user = {
      id: 'user_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      username: String(data.username).toLowerCase(),
      email: String(data.email).toLowerCase(),
      fullName: data.fullName || data.username,
      passwordHash: Utils.hashPassword(data.password, salt),
      passwordSalt: salt,
      role: data.role || 'viewer',
      status: data.status || 'active',
      created_at: Utils.nowISO(),
      last_login: null,
      last_password_change: Utils.nowISO(),
      login_attempts: 0,
      locked_until: null,
      force_pw_change: !!data.force_pw_change,
      activeSessionId: null,
      preferences: { dateFormat: 'MM/DD/YYYY', currency: 'USD', timezone: 'UTC', theme: 'auto' }
    };
    var users = Auth.allUsers();
    users.push(user);
    Utils.saveData(K.USERS, users);
    return user;
  };

  /* ---------------- Queries ---------------- */
  Auth.allUsers = function () { return Utils.loadData(K.USERS, []); };
  Auth.getUser = function (id) {
    return Auth.allUsers().find(function (u) { return u.id === id; }) || null;
  };
  Auth.findByIdentifier = function (identifier) {
    var id = String(identifier || '').toLowerCase().trim();
    return Auth.allUsers().find(function (u) { return u.username === id || u.email === id; }) || null;
  };
  Auth.findEmail = function (email) {
    var e = String(email || '').toLowerCase().trim();
    return Auth.allUsers().find(function (u) { return u.email === e; }) || null;
  };
  Auth.saveUser = function (user) {
    var users = Auth.allUsers();
    var i = users.findIndex(function (u) { return u.id === user.id; });
    if (i >= 0) users[i] = user; else users.push(user);
    Utils.saveData(K.USERS, users);
  };
  Auth.deleteUser = function (id) {
    var users = Auth.allUsers().filter(function (u) { return u.id !== id; });
    Utils.saveData(K.USERS, users);
  };

  Auth.usernameExists = function (username, excludeId) {
    var u = String(username || '').toLowerCase().trim();
    return Auth.allUsers().some(function (x) { return x.username === u && x.id !== excludeId; });
  };
  Auth.emailExists = function (email, excludeId) {
    var e = String(email || '').toLowerCase().trim();
    return Auth.allUsers().some(function (x) { return x.email === e && x.id !== excludeId; });
  };

  /* ---------------- Password rules ---------------- */
  Auth.checkStrength = function (pw) {
    var score = 0;
    if (!pw) return { score: 0, label: 'Empty', bars: 0 };
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return { score: score, label: score <= 1 ? 'Weak' : score === 2 ? 'Medium' : 'Strong', bars: score };
  };
  Auth.validatePassword = function (pw) {
    var errors = [];
    if (!pw || pw.length < 8) errors.push('minimum 8 characters');
    if (!/[A-Z]/.test(pw)) errors.push('1 uppercase letter');
    if (!/[a-z]/.test(pw)) errors.push('1 lowercase letter');
    if (!/\d/.test(pw)) errors.push('1 number');
    if (!/[^A-Za-z0-9]/.test(pw)) errors.push('1 special character');
    return errors;
  };

  /* ---------------- Lockout ---------------- */
  Auth.isLocked = function (identifier) {
    var lock = Utils.loadData(K.LOCKOUT, {});
    var rec = lock[String(identifier).toLowerCase()];
    if (!rec) return { locked: false };
    if (rec.lockedUntil && new Date(rec.lockedUntil) > new Date()) {
      return { locked: true, until: rec.lockedUntil };
    }
    return { locked: false };
  };
  Auth.recordFailedAttempt = function (identifier) {
    var lock = Utils.loadData(K.LOCKOUT, {});
    var key = String(identifier).toLowerCase();
    var rec = lock[key] || { attempts: 0, lockedUntil: null };
    rec.attempts++;
    var max = Utils.getSettings().max_login_attempts || 5;
    if (rec.attempts >= max) {
      rec.lockedUntil = new Date(Date.now() + 15 * 60000).toISOString();
      rec.attempts = 0;
    }
    lock[key] = rec;
    Utils.saveData(K.LOCKOUT, lock);
    return rec;
  };
  Auth.resetLockout = function (identifier) {
    var lock = Utils.loadData(K.LOCKOUT, {});
    delete lock[String(identifier).toLowerCase()];
    Utils.saveData(K.LOCKOUT, lock);
  };

  /* ---------------- Registration ---------------- */
  Auth.registerUser = function (data) {
    var errors = [];
    if (!data.fullName || !data.fullName.trim()) errors.push('Full name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || '')) errors.push('Valid email is required');
    if (!data.username || data.username.trim().length < 3) errors.push('Username must be at least 3 characters');
    if (Auth.usernameExists(data.username)) errors.push('Username already taken');
    if (Auth.emailExists(data.email)) errors.push('Email already registered');
    var pwErrors = Auth.validatePassword(data.password);
    if (pwErrors.length) errors.push('Password must include: ' + pwErrors.join(', '));
    if (data.password !== data.confirm) errors.push('Passwords do not match');
    if (!data.terms) errors.push('You must accept the Terms & Conditions');
    if (errors.length) return { ok: false, errors: errors };
    var user = Auth.createUserInternal({
      username: data.username, email: data.email, fullName: data.fullName,
      password: data.password, role: 'viewer', status: 'active'
    });
    Audit.log('user_registered', 'New user registered: ' + user.username + ' (' + user.email + ')', { entityType: 'user', entityId: user.id });
    return { ok: true, user: user };
  };

  /* ---------------- Login ---------------- */
  Auth.login = function (identifier, password, remember) {
    var user = Auth.findByIdentifier(identifier);
    if (!user) {
      Auth.recordFailedAttempt(identifier);
      Auth.recordLoginHistory(false, 'password', identifier);
      Audit.log('login_failed', 'Login failed for "' + identifier + '" (user not found)');
      return { ok: false, error: 'Invalid username/email or password' };
    }
    var lock = Auth.isLocked(identifier);
    if (lock.locked) {
      Auth.recordLoginHistory(false, 'password', identifier);
      Audit.log('login_failed', 'Login blocked: account locked until ' + lock.until);
      return { ok: false, error: 'Account locked due to too many failed attempts. Try again in 15 minutes.', locked: true };
    }
    if (Utils.hashPassword(password, user.passwordSalt) !== user.passwordHash) {
      var rec = Auth.recordFailedAttempt(identifier);
      Auth.recordLoginHistory(false, 'password', identifier);
      Audit.log('login_failed', 'Login failed for ' + user.username + ' (wrong password, attempt ' + rec.attempts + ')');
      var remaining = (Utils.getSettings().max_login_attempts || 5) - rec.attempts;
      return { ok: false, error: 'Invalid username/email or password' + (remaining > 0 ? ' (' + remaining + ' attempts remaining)' : '') };
    }
    if (user.status !== 'active') {
      Auth.recordLoginHistory(false, 'password', identifier);
      Audit.log('login_failed', 'Login blocked: disabled account ' + user.username);
      return { ok: false, error: 'This account is disabled. Contact an administrator.' };
    }
    Auth.resetLockout(identifier);
    var token = Auth.createSession(user, !!remember);
    user = Auth.getUser(user.id);
    user.last_login = Utils.nowISO();
    user.login_attempts = 0;
    user.locked_until = null;
    user.activeSessionId = token; // single session per user: supersedes older sessions
    Auth.saveUser(user);
    Auth.recordLoginHistory(true, 'password', identifier);
    Audit.log('user_logged_in', 'User logged in: ' + user.username + ' (' + user.role + ')', { entityType: 'user', entityId: user.id });
    return { ok: true, user: user };
  };

  /* ---------------- Sessions ---------------- */
  Auth.createSession = function (user, remember) {
    var token = 'tok_' + Utils.uid('s');
    var timeoutMin = Utils.getSettings().session_timeout || 30;
    var expiresAt = remember
      ? Date.now() + 7 * 24 * 3600 * 1000
      : Date.now() + timeoutMin * 60000;
    var session = { token: token, userId: user.id, createdAt: Utils.nowISO(), expiresAt: expiresAt, remember: !!remember, impersonating: null };
    Utils.saveData(K.SESSION, session);
    return token;
  };
  Auth.getSession = function () { return Utils.loadData(K.SESSION, null); };

  // Returns the effective user (impersonated user when admin is impersonating)
  Auth.getCurrentUser = function () {
    var session = Auth.getSession();
    if (!session) return null;
    var uid = session.impersonating ? session.impersonating.userId : session.userId;
    var user = Auth.getUser(uid);
    if (!user || user.status !== 'active') return null;
    return user;
  };

  Auth.validateSession = function () {
    var session = Auth.getSession();
    if (!session) return false;
    var user = Auth.getUser(session.userId);
    if (!user || user.status !== 'active') { Auth.logout('session_invalid'); return false; }
    if (user.activeSessionId && user.activeSessionId !== session.token) { Auth.logout('session_replaced'); return false; }
    if (Date.now() > new Date(session.expiresAt).getTime()) { Auth.logout('session_timeout'); return false; }
    return true;
  };

  Auth.touchSession = function () {
    var session = Auth.getSession();
    if (!session || session.remember) return;
    var timeoutMin = Utils.getSettings().session_timeout || 30;
    session.expiresAt = Date.now() + timeoutMin * 60000;
    Utils.saveData(K.SESSION, session);
  };

  Auth.logout = function (reason) {
    var session = Auth.getSession();
    if (session) {
      var user = Auth.getUser(session.userId);
      if (user) { user.activeSessionId = null; Auth.saveUser(user); }
      var imp = session.impersonating;
      Audit.log('user_logged_out',
        'User logged out' + (reason ? ' (' + reason + ')' : '') +
        (imp ? ' (was impersonating ' + imp.username + ')' : ''),
        { entityType: 'user', entityId: session.userId });
    }
    Utils.saveData(K.SESSION, null);
  };

  /* ---------------- Login history ---------------- */
  Auth.recordLoginHistory = function (success, method, identifier) {
    var h = Utils.loadData(K.LOGIN_HISTORY, []);
    var user = Auth.findByIdentifier(identifier);
    h.push({
      id: 'lh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: user ? user.id : null,
      identifier: identifier,
      timestamp: Utils.nowISO(),
      success: success,
      method: method,
      ipAddress: Utils.simIp(),
      browser: Utils.detectBrowser(),
      device: Utils.detectDevice()
    });
    Utils.saveData(K.LOGIN_HISTORY, h.slice(-5000));
  };

  /* ---------------- Impersonation (admin only) ---------------- */
  Auth.startImpersonation = function (userId) {
    if (!Permissions.can('impersonate_user')) return { ok: false, error: 'Not permitted' };
    var target = Auth.getUser(userId);
    if (!target) return { ok: false, error: 'User not found' };
    if (target.status !== 'active') return { ok: false, error: 'Cannot impersonate a disabled user' };
    var session = Auth.getSession();
    if (!session) return { ok: false, error: 'No session' };
    session.impersonating = { userId: target.id, username: target.username, impersonatorId: session.userId, startedAt: Utils.nowISO() };
    Utils.saveData(K.SESSION, session);
    Audit.log('impersonation_started', 'Admin impersonated user ' + target.username, { entityType: 'user', entityId: target.id });
    return { ok: true };
  };
  Auth.stopImpersonation = function () {
    var session = Auth.getSession();
    if (session && session.impersonating) {
      var t = session.impersonating;
      Audit.log('impersonation_ended', 'Admin stopped impersonating ' + t.username, { entityType: 'user', entityId: t.userId });
      session.impersonating = null;
      Utils.saveData(K.SESSION, session);
    }
  };
  Auth.isImpersonating = function () {
    var s = Auth.getSession();
    return !!(s && s.impersonating);
  };

  /* ---------------- Password flows ---------------- */
  Auth.adminResetPassword = function (userId, newPw) {
    var user = Auth.getUser(userId);
    if (!user) return { ok: false, error: 'User not found' };
    var pwErrors = Auth.validatePassword(newPw);
    if (pwErrors.length) return { ok: false, error: 'Password must include: ' + pwErrors.join(', ') };
    user.passwordSalt = Utils.genSalt();
    user.passwordHash = Utils.hashPassword(newPw, user.passwordSalt);
    user.last_password_change = Utils.nowISO();
    user.force_pw_change = true;
    Auth.saveUser(user);
    Audit.log('user_password_reset', 'Admin reset password for ' + user.username, { entityType: 'user', entityId: user.id });
    return { ok: true };
  };

  Auth.requestPasswordReset = function (email) {
    var user = Auth.findEmail(email);
    if (!user) return { ok: false, error: 'No account found with that email' };
    var token = 'rt_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    var tokens = Utils.loadData(K.RESET_TOKENS, {});
    tokens[token] = { userId: user.id, expiresAt: new Date(Date.now() + 30 * 60000).toISOString() };
    Utils.saveData(K.RESET_TOKENS, tokens);
    Audit.log('password_reset_requested', 'Password reset requested for ' + user.username);
    return { ok: true, token: token, email: user.email, username: user.username };
  };

  Auth.resetPasswordWithToken = function (token, newPw) {
    var tokens = Utils.loadData(K.RESET_TOKENS, {});
    var rec = tokens[token];
    if (!rec) return { ok: false, error: 'Invalid or expired reset link' };
    if (new Date(rec.expiresAt) < new Date()) {
      delete tokens[token]; Utils.saveData(K.RESET_TOKENS, tokens);
      return { ok: false, error: 'Reset link expired' };
    }
    var user = Auth.getUser(rec.userId);
    if (!user) return { ok: false, error: 'User not found' };
    user.passwordSalt = Utils.genSalt();
    user.passwordHash = Utils.hashPassword(newPw, user.passwordSalt);
    user.last_password_change = Utils.nowISO();
    user.force_pw_change = false;
    Auth.saveUser(user);
    delete tokens[token];
    Utils.saveData(K.RESET_TOKENS, tokens);
    Audit.log('password_changed', 'Password reset via email link for ' + user.username, { entityType: 'user', entityId: user.id });
    return { ok: true };
  };

  Auth.changePassword = function (currentPw, newPw) {
    var user = Auth.getCurrentUser();
    if (!user) return { ok: false, error: 'Not logged in' };
    if (Utils.hashPassword(currentPw, user.passwordSalt) !== user.passwordHash) {
      return { ok: false, error: 'Current password is incorrect' };
    }
    var pwErrors = Auth.validatePassword(newPw);
    if (pwErrors.length) return { ok: false, error: 'Password must include: ' + pwErrors.join(', ') };
    user.passwordSalt = Utils.genSalt();
    user.passwordHash = Utils.hashPassword(newPw, user.passwordSalt);
    user.last_password_change = Utils.nowISO();
    user.force_pw_change = false;
    Auth.saveUser(user);
    Audit.log('password_changed', 'User changed own password', { entityType: 'user', entityId: user.id });
    return { ok: true };
  };

  Auth.passwordExpired = function (user) {
    var days = Utils.getSettings().password_expiry_days || 90;
    if (!days) return false;
    var last = new Date(user.last_password_change || user.created_at).getTime();
    return (Date.now() - last) > days * 86400000;
  };

  Auth.isAdmin = function () { var u = Auth.getCurrentUser(); return !!(u && u.role === 'admin'); };
  Auth.isViewer = function () { var u = Auth.getCurrentUser(); return !!(u && u.role === 'viewer'); };

  global.Auth = Auth;
})(typeof window !== 'undefined' ? window : globalThis);
