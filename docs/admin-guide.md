⚠️ PRIVATE — confidential, do not distribute

# Administrator Guide - Double-Entry Accounting Web App

This guide provides instructions for system administrators to manage users, maintain data integrity, and configure system-wide settings for the Accounting Web App.

## Table of Contents
1. [Administrative Access](#administrative-access)
2. [User Management](#user-management)
3. [User Impersonation](#user-impersonation)
4. [Audit Logging](#audit-logging)
5. [System Settings](#system-settings)
6. [Data Management](#data-management)
7. [Security and Lockouts](#security-and-lockouts)

---

## 1. Administrative Access
Only users with the **Admin** role can access the "Administration" menu in the sidebar. The default administrator account is:
*   **Email:** admin@accounting.com
*   **Initial Password:** Admin@123

*Important: It is recommended to change this password immediately after the first login.*

---

## 2. User Management
The User Management module allows you to control who has access to the system and their level of authority.

### Managing Users
*   **Search & Filter:** Quickly find users by name, email, or role.
*   **Add/Edit:** Create new users or update existing ones.
*   **Enable/Disable:** Revoke access without deleting the user's data by disabling their account.
*   **Role Assignment:** Change user roles between Admin, Accountant, and Viewer.
*   **Password Management:** Force a password reset for a user if they forget their credentials.

### User Activity
Click on a user to view their specific activity history, including login times and modules accessed.

---

## 3. User Impersonation
For troubleshooting or auditing purposes, Admins can "Impersonate" any other user.

*   **How to start:** Go to User Management and click the "Impersonate" button next to a user.
*   **Visual Indicator:** A prominent **RED BANNER** will appear at the top of the screen to indicate you are acting as another user.
*   **Audit Trail:** All actions taken during an impersonation session are logged under both the Admin's account and the impersonated user's record, clearly marked as an "Impersonation" event.
*   **How to stop:** Click "Stop Impersonation" in the red banner to return to your Admin session.

---

## 4. Audit Logging
The Audit Log provides a complete, immutable record of all actions taken within the application.

### Logged Data
Every entry in the audit log includes:
*   **Timestamp:** The exact date and time of the action.
*   **User & Role:** Who performed the action and their permission level.
*   **Action:** The specific operation (e.g., "Create Journal Entry", "Login", "Update User").
*   **Details:** Specifics of the change (e.g., Account ID, amounts, old vs. new values).
*   **Metadata:** Simulated IP address, browser type, and device information.

### Maintenance
*   **Filtering:** Filter logs by User, Action type, Date range, or Keyword.
*   **Export:** Export logs to CSV or Excel for external review.
*   **Archiving:** Logs are auto-archived based on the "Log Retention" setting in System Settings.
*   **Clearing:** Admins can clear the log, but this requires a secondary confirmation.

---

## 5. System Settings
Configure the global behavior of the application.

### General Settings
*   **Company Name:** Displayed on all reports and the dashboard.
*   **Currency & Formats:** Define the default currency symbol, date format, and timezone.
*   **Fiscal Year:** Set the start month for the company's fiscal year.

### Security Settings
*   **Session Timeout:** Minutes of inactivity before auto-logout (Default: 30 min).
*   **Login Policy:** Max login attempts before lockout (Default: 5).
*   **Password Rules:** Enforce password expiry and complexity requirements.
*   **2FA Toggle:** Enable or disable simulated Two-Factor Authentication.
*   **Force Password Change:** Set a flag to require all users to change passwords on their next login.

### Maintenance Settings
*   **Log Retention:** Number of days to keep audit logs before archiving.
*   **Auto-Backup:** Frequency of simulated backup reminders.
*   **Upload Limits:** Set the maximum file size and allowed extensions for imports.

---

## 6. Data Management
Since the app uses `localStorage`, data is stored in the user's browser. The Data Management module provides tools to ensure this data is safe and consistent.

*   **JSON Backup:** Download the entire system state (users, accounts, entries, logs) as a single JSON file. **Perform this daily.**
*   **JSON Restore:** Upload a previously exported JSON backup to restore the system state.
*   **Integrity Check:** Runs a script to find unbalanced entries or orphaned sub-accounts.
*   **Orphan Cleanup:** Automatically removes data fragments that are no longer linked to active accounts.
*   **Sample Data:** Load the default demo data for training or testing purposes.
*   **Storage Usage:** Displays how much of the browser's 5MB-10MB `localStorage` quota is currently occupied.

---

## 7. Security and Lockouts
The system includes built-in protection against unauthorized access:

*   **Lockout:** If a user fails to log in 5 times consecutively, the account is locked for 15 minutes.
*   **Password Strength:** A real-time meter enforces high-entropy passwords during registration and changes.
*   **Encryption:** All passwords are saved as SHA-256 hashes with unique per-user salts using the `CryptoJS` library. No plain-text passwords ever touch the storage.
