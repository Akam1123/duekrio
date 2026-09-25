# Product brief

Duenara is the provisional name for this working prototype. It is not trademark-cleared, and marketing is on hold.

## Problem and user

Small B2B service firms often have open invoices spread across an accounting report, an inbox, and individual teammates' notes. The AR balance identifies what is unpaid, but it does not always capture the reason or the next human action. Duenara is for a 5–30 person team whose founder, operations lead, or finance coordinator owns customer follow-up.

## Product promise

Make every open invoice actionable: **why is it unpaid, who owns the next step, what happens next, and when did the customer say they would pay?** The product is an operating view alongside an accounting system, not an accounting replacement.

## MVP scope

| Area | MVP behavior |
| --- | --- |
| Intake | Manually import a flat QuickBooks- or Xero-style AR CSV with customer, invoice number, remaining amount due, and due date columns; add an invoice by hand; show a fictional sample dataset for exploration. |
| Resolution board | Display open invoices with customer, amount, due date, and attention state. |
| Human context | Record reason for nonpayment, owner, next action, notes, and promise date. |
| Focus | Sort or filter for overdue invoices and follow-ups that need attention. |
| Follow-up | Generate a copyable email draft for a person to review in their own mail client. |
| Portability | Export a working CSV or versioned JSON backup, and restore a compatible JSON backup. |
| Reconciliation | Flag previously open invoices absent from the latest CSV and locally paid invoices still present; require a person to review their ledger before changing status. |

## Deliberate boundaries

- No automatic email delivery, reminders, SMS, or customer contact.
- No QuickBooks or Xero API connection, live synchronization, or automatic reconciliation.
- No payment collection, invoicing, billing, or accounting ledger changes.
- No account system, team permissions, cloud storage, or cross-device sync.
- Owner fields are labels within the local board; they do not assign work to another person's account or send notifications.
- No claim that a draft, promise date, or board state proves a payment will occur.

The local-first design keeps setup light, but browser storage is not a durable business record. Users must export backups and verify financial values in their accounting system. CSV layouts vary, so the import flow needs clear feedback when a file cannot be read or mapped.

The importer currently treats amounts as USD, accepts ISO or US month/day/year dates, and preserves existing notes on reimport. It prefers balance columns over generic amount columns when both are present. It also retains invoices omitted from a later CSV, because omission alone does not prove payment. A person must reconcile status with the accounting ledger. Users can delete an invoice from its detail drawer after confirmation, and restoring a backup requires confirmation before replacing current work.

## Design principles

1. **Human decision at the edge:** the app may draft language; a person owns the message and the customer relationship.
2. **Visible provenance:** imported figures come from a dated CSV snapshot, while resolution notes come from users.
3. **Action over dashboards:** the main view should answer what the team should do next.
4. **Plain language:** avoid accounting jargon when a direct label works.
5. **Exportability:** users should be able to retain their working data independently of the app.

## Validation before expansion

Pilot with a handful of B2B service teams using sample or authorized AR exports. Observe whether the board becomes the weekly follow-up list, whether owners keep next actions current, and whether drafts save time without reducing message quality. Ask for payment before assuming the workflow has commercial value. Do not infer revenue, collection-rate improvement, or customer demand from a working demo.

## Honest roadmap

1. Strengthen CSV column mapping, import error explanations, and duplicate handling based on real authorized exports.
2. Add safer backup and restore, plus a visible snapshot date and stale-data warning.
3. Explore team collaboration and accounting integrations only after the manual workflow earns repeat use and the security model is ready.

These are possible next steps, not shipped features or delivery commitments.
