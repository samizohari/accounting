⚠️ PRIVATE — confidential, do not distribute

# Excel & CSV Import/Export Guide

This application leverages the `SheetJS` (xlsx) and `PapaParse` (csv) libraries to provide robust data portability. This guide details the schemas and workflows for moving data in and out of the system.

## Table of Contents
1. [Import Workflow](#import-workflow)
2. [Data Schemas](#data-schemas)
3. [Exporting Data](#exporting-data)
4. [Templates](#templates)
5. [Troubleshooting](#troubleshooting)

---

## 1. Import Workflow
All imports follow a standardized four-step safety process to prevent data corruption.

1.  **Drag-and-Drop:** Upload your CSV or XLSX file to the target module (Chart of Accounts, Journal Entries, Bank Statement, or Budget).
2.  **Validation:** The system checks for formatting errors, missing required fields, and logical consistency (e.g., ensuring Account Numbers exist for Journal Entries).
3.  **Preview:** A table displays the parsed data. Errors are highlighted in red with tooltips explaining the issue.
4.  **Commit / Rollback:** If the data is valid, click "Commit" to save to `localStorage`. If errors are found, you can "Rollback" (clear the preview) and fix your source file.

---

## 2. Data Schemas
Files must match these column headers exactly (case-sensitive).

### A. Chart of Accounts
*   **Account Number:** Unique identifier (e.g., 1001).
*   **Name:** Description of the account.
*   **Type:** Must be one of: `Asset`, `Liability`, `Equity`, `Revenue`, `Expense`.
*   **Parent:** (Optional) The Account Number of the parent account for sub-account structures.
*   **Normal Balance:** `Debit` or `Credit`.
*   **Status:** `Active` or `Inactive`.

### B. Journal Entries
*   **Date:** Transaction date (YYYY-MM-DD).
*   **Reference:** Unique identifier for the transaction (e.g., INV-101).
*   **Description:** Narrative for the transaction.
*   **Account Number:** Valid number from your Chart of Accounts.
*   **Debit:** Numerical amount (0 if not applicable).
*   **Credit:** Numerical amount (0 if not applicable).
*   *Note: Multiple rows with the same Reference will be grouped into a single multi-line Journal Entry.*

### C. Bank Statement
*   **Date:** Transaction date.
*   **Description:** Statement text.
*   **Debit:** Amount decreased.
*   **Credit:** Amount increased.
*   **Balance:** (Optional) The ending balance after the transaction.

### D. Budget
*   **Account Number:** Valid account number.
*   **Period:** Month in `YYYY-MM` format.
*   **Amount:** The targeted budget for that period.

---

## 3. Exporting Data

### Multi-Sheet Excel Workbook
The "Export All" feature generates a comprehensive `.xlsx` file containing 8 sheets:
1.  **Chart of Accounts:** Full list of accounts and statuses.
2.  **Journal Entries:** Chronological history of all entries.
3.  **General Ledger:** Account-by-account transaction lists.
4.  **Trial Balance:** Includes built-in **Excel SUM formulas** to verify totals automatically.
5.  **Income Statement:** P&L summary.
6.  **Balance Sheet:** Snapshots of Assets, Liabilities, and Equity.
7.  **Cash Flow:** Summary of cash movements.
8.  **Budget:** Detailed actual vs. budget comparisons.

### Individual Exports
Modules also support individual exports to CSV for quick data manipulation in spreadsheet software.

---

## 4. Templates
Standardized templates are available in the `templates/` folder of the project root:
*   `accounts-template.xlsx`
*   `journal-template.xlsx`
*   `bank-statement-template.xlsx`
*   `budget-template.xlsx`

Each template contains an **Instructions sheet** detailing data types and mandatory fields. Use these as a starting point to ensure successful imports.

---

## 5. Troubleshooting
*   **Validation Failures:** Download the "Error Report" generated during a failed import to see a line-by-line breakdown of issues.
*   **Date Formats:** The system prefers ISO format (`YYYY-MM-DD`). If your Excel file uses local formats, ensure the cell type is set to "Date" in Excel before saving.
*   **Duplicate Numbers:** The system will reject imports that attempt to create duplicate Account Numbers or duplicate Journal Reference IDs if they don't match the existing transaction structure.
