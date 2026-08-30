⚠️ PRIVATE — confidential, do not distribute

# User Manual - Double-Entry Accounting Web App

Welcome to the Double-Entry Accounting Web App, a pure client-side financial management solution. This application operates entirely within your browser, ensuring that your financial data remains private and local to your device.

## Table of Contents
1. [Getting Started](#getting-started)
2. [User Roles and Permissions](#user-roles-and-permissions)
3. [Dashboard](#dashboard)
4. [Chart of Accounts](#chart-of-accounts)
5. [Journal Entries](#journal-entries)
6. [General Ledger](#general-ledger)
7. [Trial Balance](#trial-balance)
8. [Financial Reports](#financial-reports)
9. [Bank Reconciliation](#bank-reconciliation)
10. [Budget & Variance](#budget--variance)
11. [Profile and Preferences](#profile-and-preferences)
12. [Mobile Usage](#mobile-usage)

---

## 1. Getting Started
To launch the application, simply open `index.html` in a modern web browser (Chrome, Firefox, Safari, or Edge). No server installation or database setup is required.

### Initial Login
On the first run, the system is seeded with default accounts. You can log in using one of the following:

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | admin@accounting.com | Admin@123 |
| **Accountant** | accountant@accounting.com | Acc@123 |
| **Viewer** | viewer@accounting.com | View@123 |

**Registration:** New users can register through the sign-up page. Note that all self-registered users are assigned the **Viewer** role by default and must be upgraded by an Administrator.

---

## 2. User Roles and Permissions
The system employs a strict Role-Based Access Control (RBAC) model:

*   **Admin:** Full access to all modules, including user management, audit logs, system settings, and data management. Admins can impersonate other users and perform force-deletions.
*   **Accountant:** Full access to accounting modules (Journal, Ledger, Reports, Imports). Accountants can only see and manage data they have created or are assigned to.
*   **Viewer:** Read-only access to the Dashboard, Ledger, Trial Balance, and Reports. Viewers cannot create, edit, delete, or perform any import/export operations.

---

## 3. Dashboard
The Dashboard provides a high-level overview of your financial health.

### Key Performance Indicators (KPIs)
*   **Cash Balance:** Total current cash across all liquid accounts.
*   **MTD Performance:** Monthly Total (MTD) Revenue, Expenses, and Net Income.
*   **Balance Sheet Summary:** Real-time totals for Assets, Liabilities, and Equity.
*   **Activity:** Total journal entry count for the current period.

### Visualizations
*   **Cash Flow:** A 12-month line chart showing trends in cash movement.
*   **Revenue vs Expenses:** A comparative bar chart.
*   **Expense Distribution:** A doughnut chart breaking down expenses by category.

### Recent Activity
The dashboard also features an **Alerts** section for pending approvals and a **Recent Entries** table for quick navigation.

---

## 4. Chart of Accounts
The Chart of Accounts (CoA) is the backbone of your accounting system.

### Account Types
Every account must fall into one of five categories:
1.  **Asset** (Normal Balance: Debit)
2.  **Liability** (Normal Balance: Credit)
3.  **Equity** (Normal Balance: Credit)
4.  **Revenue** (Normal Balance: Credit)
5.  **Expense** (Normal Balance: Debit)

### Managing Accounts
*   **Hierarchy:** Supports parent-child relationships for sub-accounts.
*   **Numbering:** Suggests the next available number based on account type.
*   **Status:** Accounts can be marked as Active or Inactive.

---

## 5. Journal Entries
Record all financial transactions through the Journal Entries module.

### Creating an Entry
*   **Multi-line Support:** Add as many lines as needed for a single transaction.
*   **Balance Check:** The system automatically validates that Total Debits = Total Credits before allowing a save.
*   **Details:** Include Reference numbers, Dates, and descriptive Notes.

### Workflow
*   **Status:** Entries start as **Draft**. They can move to **Active**, then **Approved** or **Rejected**.
*   **Actions:** Authorized users can **Reverse**, **Approve**, or **Reject** entries.
*   **Recurring:** Set up automated entries on a Daily, Weekly, or Monthly basis.

---

## 6. General Ledger
The General Ledger provides a detailed chronological record of all transactions for every account.

*   **Running Balance:** See the balance change with every transaction.
*   **Filtering:** Filter by specific Date Ranges or individual accounts to drill down into details.

---

## 7. Trial Balance
Verify the mathematical accuracy of your bookkeeping.

*   **Types:** View Unadjusted, Adjusted, or Post-Closing Trial Balances.
*   **As-Of Date:** Generate the balance for any specific point in time.
*   **Validation:** A "Balanced" indicator confirms that total debits equal total credits.

---

## 8. Financial Reports
Generate professional-grade financial statements.

*   **Income Statement (P&L):** Tracks profitability over a period.
*   **Balance Sheet:** Verifies the Accounting Equation (Assets = Liabilities + Equity).
*   **Cash Flow:** Both Direct and Indirect methods are supported.
*   **Retained Earnings:** Tracks changes in equity over time.
*   **Comparative Reports:** Compare performance Month-over-Month (MoM) or Year-over-Year (YoY).

*Note: All reports can be exported to Excel or printed directly from the browser.*

---

## 9. Bank Reconciliation
Ensure your internal records match your bank statements.

*   **Manual Matching:** Mark entries as reconciled as you review them.
*   **Auto-Match:** Import a bank statement (CSV/XLSX). The system auto-matches entries based on Date and Amount.
*   **Reconciliation Report:** Export a summary of reconciled and outstanding items.

---

## 10. Budget & Variance
Plan your finances and track performance against targets.

*   **Setup:** Set monthly budgets for specific accounts.
*   **Variance Analysis:** Compare Actual vs. Budgeted amounts.
*   **Visuals:** Bar charts indicate Favorable vs. Unfavorable variances at a glance.

---

## 11. Profile and Preferences
Customize your experience via the Profile page:
*   **Account Info:** View your role and email.
*   **Security:** Change your password (requires current password).
*   **Preferences:** Set your preferred Date Format, Currency Symbol, and Theme (Light or Dark mode).

---

## 12. Mobile Usage
The app is fully responsive and optimized for mobile devices (especially iOS).

*   **Navigation:** A bottom navigation bar appears on small screens for easy thumb access.
*   **Touch Optimized:** Large touch targets (≥44px) and haptic-style ripple effects.
*   **Gestures:** Supports pull-to-refresh on most lists.
*   **Display:** Full-screen modals and iOS-compliant dark mode support.
*   **PWA:** Can be "Added to Home Screen" as a Progressive Web App.
