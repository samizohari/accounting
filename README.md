# Accounting System - Double-Entry Accounting Software

## ⚠️ PRIVATE REPOSITORY ⚠️

**This repository is PRIVATE and confidential.**
**Do NOT share access without authorization.**
**Contact the repository owner for access requests.**

## Description

A fully functional double-entry accounting system built with **pure JavaScript, HTML and CSS** — no backend, no server, no database. All data lives in the browser's `localStorage`. Optimized for iPhone and all mobile devices with Bootstrap 5.

## Access

- Repository: `https://github.com/[your-username]/accounting` (create as **Private**)
- Access Level: Private
- Owner: [your-username]
- Authorized Collaborators: [List authorized usernames]

### One-time private repo setup (run once, requires GitHub CLI)

```bash
gh auth login                 # authenticate once
gh repo create accounting --private --source . --push
```

Then enable in **Settings → Branches → main → Add rule**:
- Require a pull request before merging (1 reviewer) · Dismiss stale approvals
- Require status checks · Require branches up to date · Include administrators
- Restrict who can push · (optional) Require signed commits · Require linear history
- Require conversation resolution

Enable in **Settings → Code security**: Dependabot alerts, secret scanning, code scanning.

## Quick Start

1. Clone the repository (requires authorization):
   ```bash
   git clone https://github.com/[your-username]/accounting.git
   ```
2. Open `index.html` in your browser — or serve it with any static server:
   ```bash
   python3 -m http.server 8080    # then visit http://localhost:8080
   ```
3. **No server required!** Everything runs 100% client-side.

## Default Users

| Role       | Username     | Email                     | Password    |
|------------|--------------|---------------------------|-------------|
| Admin      | admin        | admin@accounting.com      | Admin@123   |
| Accountant | accountant   | accountant@accounting.com | Acc@123     |
| Viewer     | viewer       | viewer@accounting.com     | View@123    |

> ⚠️ Change these passwords immediately after first login.

## Features

- ✅ Double-entry accounting (debits = credits, auto balance check)
- ✅ Excel import/export (.xlsx, .xls) via SheetJS — multi-sheet workbooks, SUM formulas, autofilters
- ✅ CSV import/export with validation, preview and rollback
- ✅ Chart of Accounts management (parent-child, 5 account types, normal balances)
- ✅ Journal entries with multiple lines, reverse/approve/reject, recurring entries
- ✅ General Ledger with running balances
- ✅ Trial Balance (Unadjusted / Adjusted / Post-Closing)
- ✅ Financial Statements (P&L, Balance Sheet, Cash Flow direct+indirect, Retained Earnings, Comparative MoM/YoY)
- ✅ Bank reconciliation + bank statement import
- ✅ Budgeting and variance analysis
- ✅ User authentication with roles (Admin, Accountant, Viewer)
- ✅ Multi-user support with per-user data isolation
- ✅ Login lockout (5 attempts), password rules + strength meter, session timeout (30 min)
- ✅ Dashboard with Chart.js charts and alerts
- ✅ Comprehensive audit logging (every action, filterable, exportable, retention-based archiving)
- ✅ Admin panel: user management, settings, data management, backup/restore, impersonation
- ✅ Responsive design (Bootstrap 5) + enhanced iPhone support (safe areas, bottom nav, touch targets)
- ✅ Print and PDF export
- ✅ Data backup and restore (JSON)

## File Structure

```
/accounting/
├── index.html             - Main entry point (all views & modals)
├── manifest.json          - PWA manifest
├── css/
│   ├── style.css          - Custom styles
│   └── mobile.css         - Mobile-specific enhancements
├── js/
│   ├── app.js             - Main application logic (router, views, wiring)
│   ├── auth.js            - Authentication module
│   ├── admin.js           - Admin panel functionality
│   ├── audit-log.js       - Audit logging system
│   ├── permissions.js     - Role-based access control
│   ├── accounting.js      - Double-entry accounting engine
│   ├── excel-handler.js   - Excel import/export
│   ├── csv-handler.js     - CSV import/export
│   ├── reports.js         - Financial reports generator
│   ├── dashboard.js       - Dashboard and charts
│   ├── mobile.js          - Mobile-specific interactions
│   └── utils.js           - Utility functions
├── templates/             - Pre-formatted Excel templates (+ instructions sheet)
├── sample-data/           - Sample CSV/JSON data for testing
├── docs/                  - User, admin, Excel and deployment guides
├── .gitignore             - Enhanced for private repository
├── LICENSE                - Proprietary license
└── README.md
```

## Technology Stack

- HTML5 · CSS3 (Bootstrap 5) · Vanilla JavaScript (ES6+)
- SheetJS (Excel) · Chart.js (charts) · CryptoJS (SHA-256 + salt hashing)
- FileSaver.js · html2pdf.js · localStorage / IndexedDB

## Deployment (Private/Internal)

- Host on an internal web server (static hosting is enough)
- Deploy to GitHub Pages / private Pages with restricted access
- Use corporate intranet

## Security

- All passwords hashed with CryptoJS (SHA-256 + per-user salt) — never stored in plaintext
- Role-based access control with a permission matrix (Admin / Accountant / Viewer)
- Session management with 30-minute idle timeout + single-session enforcement
- Login lockout after 5 failed attempts
- Input sanitization on all rendering (XSS-safe)
- Comprehensive audit logging of every user action
- No external data storage — records never leave the browser unless you export them

## License

This is a PRIVATE repository. Code is confidential and proprietary.
Unauthorized distribution or use is strictly prohibited. See [LICENSE](LICENSE).

## Contact

- Owner: [Your Name] - [your-email@example.com]
- For access requests, contact the repository owner.
