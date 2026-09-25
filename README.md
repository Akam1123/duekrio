# PromiseLedger

**A local-first invoice resolution board for small B2B service firms.**

PromiseLedger helps a 5–30 person team turn an accounts receivable export into a clear follow-up plan: which invoice needs attention, why it remains unpaid, who owns the next step, and what the customer has promised. It prepares email drafts for a person to review and send through their own email client.

**[Try the live workspace](https://akam1123.github.io/promiseledger/)** · [Read the market thesis](docs/MARKET.md) · [See the first-customer plan](docs/GO_TO_MARKET.md)

![PromiseLedger action board with fictional sample invoices](docs/images/board.png)

## What you can do

- Import a flat QuickBooks- or Xero-style accounts receivable CSV export.
- Add an invoice manually when you do not have a CSV.
- Review open invoices and record a reason, owner, next action, and promise date.
- Filter the board to focus on work that is overdue or needs attention.
- Prepare a contextual follow-up email draft for human review.
- Export your working data as CSV or a JSON backup, and restore that JSON backup.
- Review invoices absent from a later import and invoices marked paid locally that still appear in the new report.

The included demo and [sample AR CSV](public/sample-ar-aging.csv) use fictional invoices so you can explore the workflow without importing real customer data.

## Run locally

Requires a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Open the local address printed by the development server. To check or create a production build:

```bash
npm run test
npm run build
```

These commands run from this repository's root. See `package.json` for the exact scripts.

## Basic workflow

1. Choose **Explore sample data**, **Import CSV**, or **Add invoice**. A flat AR CSV needs customer, invoice number, **remaining amount due**, and due date columns; common header variants are recognized. If both `Amount` and `Balance` columns exist, the importer uses the balance. Dates must be `YYYY-MM-DD` or US `M/D/YYYY`, and amounts are treated as USD.
2. For each open invoice, record the blocker, responsible teammate, and next action.
3. Capture a customer's promised payment date when one exists.
4. Review an email draft. Copy it or open it in your email app, then check the facts, recipient, and tone before sending.
5. Use **Backup** to download a restorable JSON file after making changes. **Export CSV** creates a spreadsheet copy.
6. On later imports, review the reconciliation warning. The app keeps invoices absent from a new CSV and does not automatically reopen invoices previously marked paid. Confirm those statuses in the ledger. You can delete an invoice from its detail drawer after confirmation.

## Privacy and limits

PromiseLedger is local-first. The prototype has no account, cloud sync, or server-side backup. Working data remains in this browser on this device; clearing browser storage or changing devices can remove access to it. Use the export function to keep a separate backup. Anyone with access to your browser profile may be able to view the stored data, so use a trusted device and avoid importing information you are not authorized to handle.

An owner name on an invoice is an organizational label. It does not grant access, assign an account, or notify that teammate.

CSV import is a manual snapshot, and some accounting-system exports may need column cleanup. Reimport retains your notes and invoices absent from the new file; absence does not mean an invoice was paid. A persistent review queue flags absent open invoices and locally paid invoices still in the new CSV. PromiseLedger does not connect to QuickBooks or Xero, verify balances against either system, send email, collect payments, or bill customers. Drafts require a human to review them and decide whether to send them. Treat the accounting system as the source of truth.

See [the product brief](docs/PRODUCT.md) for scope and planned next steps.

## License

MIT. See [LICENSE](LICENSE).
