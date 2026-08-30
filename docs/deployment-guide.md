⚠️ PRIVATE — confidential, do not distribute

# Deployment & Internal Operations Guide

This document covers the technical setup, security architecture, and deployment procedures for the Accounting Web App. As a pure client-side application, deployment is straightforward but must be handled with care regarding data privacy.

## Table of Contents
1. [Deployment Options](#deployment-options)
2. [Source Control & GitHub Setup](#source-control--github-setup)
3. [Security Architecture](#security-architecture)
4. [Storage and Data Integrity](#storage-and-data-integrity)
5. [Disaster Recovery & Backup](#disaster-recovery--backup)

---

## 1. Deployment Options
The app consists of static files (HTML, CSS, JS) and does not require a backend server or database.

### Option A: Internal Web Server (Recommended)
Serve the files from a corporate intranet server (e.g., Nginx, Apache, or IIS).
*   **Pros:** Data remains behind the corporate firewall; no external internet access required.
*   **Setup:** Copy all files to the web root and point the server to `index.html`.

### Option B: Local Access
Open the `index.html` file directly from a shared network drive or local disk.
*   **Pros:** Zero infrastructure required.
*   **Cons:** Browser security policies (CORS) may occasionally interfere with complex local file interactions depending on the browser version.

### Option C: GitHub Pages (Private)
If using GitHub Enterprise or a private repository with GitHub Pages.
*   **Warning:** Ensure the repository is **Private** and access is restricted to authorized personnel only.

---

## 2. Source Control & GitHub Setup
To initialize the project in a new private repository, use the following commands:

```bash
# Initialize git
git init

# Add all project files
git add .

# Create the private repository using GitHub CLI
gh repo create accounting --private --source . --push

# Recommended: Enable branch protection for 'main'
# This ensures all changes are reviewed before merging.
```

### File Structure
Ensure the following structure is maintained for the application to function correctly:
*   `index.html`: Entry point.
*   `manifest.json`: PWA configuration.
*   `css/`: Contains `style.css` and `mobile.css`.
*   `js/`: Core logic (app.js, auth.js, admin.js, etc.).
*   `templates/`: Excel/CSV import templates.
*   `sample-data/`: Initial seeds for testing.
*   `docs/`: This documentation.

---

## 3. Security Architecture
The application implements several "Bank-Grade" security features locally:

### Authentication & Authorization
*   **Hashing:** Passwords are never stored in plain text. They are hashed using **SHA-256** with a **unique per-user salt** via the `CryptoJS` library.
*   **Session Management:**
    *   30-minute idle timeout with automatic logout.
    *   "Remember Me" functionality extends the session to 7 days using encrypted cookies.
    *   **Single Session Enforcement:** Logic in `auth.js` prevents multiple active sessions for the same user ID.
*   **Lockout Policy:** Accounts are locked for 15 minutes after 5 failed login attempts.

### Access Control
*   The `permissions.js` module interceptor checks the user's role before rendering any module or executing any data operation.
*   **Viewer** roles are strictly barred from any `POST`, `PUT`, or `DELETE` style operations in the local JS logic.

---

## 4. Storage and Data Integrity
The application uses the browser's `localStorage` API.

*   **Capacity:** Most browsers allow 5MB to 10MB per origin. This is sufficient for several years of accounting data for a small-to-medium business.
*   **Isolation:** Data is isolated to the specific browser and profile. Clearing browser cache/data **will delete all accounting records** unless a backup exists.
*   **Integrity:** The `accounting.js` module performs a balance check on every write. If an entry would cause an imbalance, the write is aborted.

---

## 5. Disaster Recovery & Backup
Because data is local to the browser, the **Admin** must establish a rigorous backup routine.

### Backup Best Practices
1.  **Daily JSON Exports:** Use the "Data Management" tool to download a full system backup every evening.
2.  **External Storage:** Store the exported JSON files on a secure, backed-up corporate network drive.
3.  **Audit Log Archiving:** Periodically export audit logs to Excel and clear the local log to maintain application performance.

### Restoration Procedure
In the event of browser data loss:
1.  Open the application.
2.  Log in as Admin (using default credentials if the system was reset).
3.  Navigate to **Administration > Data Management**.
4.  Upload the most recent JSON backup file.
5.  Perform a "System Integrity Check" to verify the restoration.
