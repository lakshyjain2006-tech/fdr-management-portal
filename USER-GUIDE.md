# FDR Management Portal — Demo User Guide

This guide explains how to sign in to the FDR Management Portal, what each section does, and how to walk through the main FDR workflows.

## 1. Start the website

1. Open a terminal in the project folder.
2. Run:

   ```bash
   npm install
   npm start
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.
4. The FDR Management Portal sign-in page should appear.

Node.js 18 or newer is required. Demo accounts and their shared password are initialized by `src/seed.js`.

## 2. Demo accounts and login

All demo accounts use this password:

**Password:** `demo123`

| What you want to try | Email | What this account can do |
|---|---|---|
| Institution workflow | `bit@demo.in` | View and submit FDRs for Bhopal Institute of Technology; request renewals or releases |
| Another institution | `sagar@demo.in` | View and submit FDRs for Sagar College of Engineering |
| AICTE officer workflow | `officer@demo.in` | Review submissions, verify documents, confirm with the mock bank, and handle release requests |
| Admin / authority workflow | `admin@demo.in` | Officer actions plus final release approval, user management, and alert configuration |

### Sign-in steps

1. On the sign-in page, enter one of the emails in the table.
2. Enter `demo123` as the password.
3. Select **Sign in**.
4. Alternatively, select the **Institution**, **AICTE officer**, or **Authority** demo button to fill the email and password, then select **Sign in**.

The menu is role-specific. To experience another role, select **Sign out** at the bottom of the navigation panel, then sign in with a different account.

## 3. Main navigation and features

### Today

The dashboard gives you summary totals, FDRs needing action, and active FDRs maturing within 90 days. The **Needs action** list changes based on your role:

- **Institutions** see flagged or rejected records and active FDRs that have matured.
- **Officers** see records awaiting review or bank confirmation, release requests, and overdue active FDRs.
- **Admins** see officer items plus release requests awaiting final approval.

Select an FDR row to open its details.

### My FDRs / All FDRs

- Institution accounts see **My FDRs**, limited to their institution's records.
- Officer and admin accounts see **All FDRs**.
- Use **Filter by status** to narrow the list.
- Select a row to open the FDR detail page.

### Submit an FDR

This section is available to institution accounts. Enter the FDR number, bank, amount, issue and maturity dates, and any other requested details. Attach the scanned FDR document.

Accepted document types are **PDF, PNG, or JPG**, with a maximum size of **5 MB**. The server checks that the uploaded file contents match an allowed type. Automatic checks look for issues including missing documents, invalid amounts or dates, duplicate FDRs or documents, already-matured FDRs, and short tenure.

Depending on the checks, the record may be submitted as **Awaiting officer** or **Flagged**. A duplicate FDR number for the same bank is blocked.

### Alerts

Alerts include workflow updates and maturity reminders. The app describes reminders at **90, 60, 30, and 7 days** before maturity, followed by escalation. Opening the Alerts page marks alerts as read.

**Email and SMS are simulated, not sent.** Alerts appear in the portal, and simulated notifications are also printed in the server console.

### Audit trail

This section is available to officer and admin accounts. It lists recorded actions—such as submissions, verification decisions, and release decisions—with timestamps and related FDRs. Each entry is part of a hash chain; the page reports whether the chain is intact.

### Admin

This section is available only to `admin@demo.in` (and other admin-role users).

- **Alert rules:** Set reminder days and the officer escalation threshold, then select **Save rules**.
- **Run daily check now:** Run the maturity and escalation check immediately.
- **Add a user:** Create an institution, officer, or admin account. Institution users also need an institution name.
- **Users:** View accounts and enable or disable them using the **Active** checkbox. You cannot deactivate your own admin account.

## 4. Step-by-step FDR lifecycle

### A. Institution submits an FDR

1. Sign in as `bit@demo.in` or `sagar@demo.in`.
2. Select **Submit an FDR**.
3. Enter the FDR number, bank, amount, issue date, maturity date, and any other requested details.
4. Attach the FDR document. Use a PDF, PNG, or JPG file no larger than 5 MB.
5. Select **Submit FDR**.
6. The app opens the new record. Review its lifecycle, automatic discrepancy findings, and status.

### B. Officer reviews the submission

1. Sign out, then sign in as `officer@demo.in`.
2. Open **Today** and select a record in **Needs action**, or locate it under **All FDRs**.
3. On the detail page, review the FDR details, document, and any discrepancies.
4. Select **Verify documents** to approve it or **Reject** to reject it.
5. Enter the requested observation or rejection reason and submit the decision.

An officer observation is required for a high-severity discrepancy or a rejection. After approval, the record moves to **Awaiting bank**.

### C. Officer confirms with the bank

1. On the same record, select **Confirm with bank** to run the mock bank check.
2. If you have an external bank confirmation reference to record, select **Record manual bank confirmation** and enter that reference instead.
3. A successful check changes the status to **Active** and the bank status to **Verified by bank**.
4. A failed check flags the record and displays the reason.

The bank adapter is a prototype and does not contact a real bank. Its demo behavior deliberately fails an FDR number containing `FAKE`.

### D. Institution renews or requests release

For an **Active** FDR, the institution can:

- Select **Renew / replace** to enter replacement FDR details and upload the new document. The updated record must go through officer and bank verification again.
- Select **Request release**, provide a reason, and submit the request.

### E. Officer and admin decide a release request

1. The officer opens a record with **Release requested** status.
2. Select **Recommend release** to pass it to the authority, or **Reject release** and provide a reason.
3. If recommended, the admin opens the record with **Release recommended** status.
4. The admin selects **Give final approval** or **Reject release**.
5. A release before the FDR maturity date requires written remarks from the admin.
6. Final approval changes the status to **Closed**.

## 5. What appears on an FDR detail page

- **Lifecycle tracker and status:** Shows where the record is in the process.
- **Trust panel:** Separates institutional submission from bank confirmation. A submitted FDR is not treated as bank-verified until confirmation succeeds.
- **Details and discrepancies:** Shows FDR data and automatic-check findings.
- **Document:** Opens the uploaded file after checking its recorded SHA-256 hash.
- **History:** Lists actions, actors, timestamps, and audit hashes.
- **Action buttons:** Vary according to your role and the record's current status.

## 6. Status meanings

| Status shown in the website | Meaning |
|---|---|
| **Awaiting officer** | Submitted and waiting for officer review |
| **Flagged** | An automatic check or bank verification identified an issue |
| **Awaiting bank** | Officer review is complete; bank confirmation is next |
| **Active** | Bank verification succeeded |
| **Release requested** | Institution requested release; officer decision is pending |
| **Release recommended** | Officer recommended release; admin decision is pending |
| **Closed** | Admin gave final release approval |
| **Rejected** | The record was rejected; the workflow stops |

## 7. Preloaded demo records

Demo data is created on first start. The sample records include active FDRs, one awaiting officer review, and a deliberately flagged record named `FAKE/BPL/2025/000001`. Use the flagged record to explore discrepancy review and the mock bank's failed-verification behavior.

Maturity status can change over time because it is calculated using the current date.

## 8. Reset the demo data

To restore the original demo records, run:

```bash
npm run reseed
```

**Warning:** This resets the demo database and removes generated `doc-*` files from the uploads folder. Changes made to demo records and users will be lost.

## 9. Prototype limitations

- **Bank verification is simulated.** The mock adapter accepts most FDR numbers and deliberately fails numbers containing `FAKE`; it does not contact a bank.
- **Alerts are not actually emailed or texted.** They are stored in the app and printed in the server console. Maturity checks run at startup and then every 24 hours; an admin can also run one immediately.
- **Storage is local.** Records use `data/db.json`, and uploaded documents are stored in `uploads/`, rather than a production database or object store.
- OCR, automated document-content matching, OTP/2FA, and real bank integrations are not included.
- The demo uses a fallback JWT secret. Configure `JWT_SECRET` before any real deployment; see `.env.example`.

