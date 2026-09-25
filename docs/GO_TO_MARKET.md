# PromiseLedger: first-customer plan

Plan drafted 25 September 2026. This document describes future validation and distribution; **no prospects have been contacted and no customers or revenue are claimed**.

## Positioning

For small B2B service firms with overdue invoices, PromiseLedger is a focused workspace for recording *why payment is stuck, who owns the next step, and what the customer committed to do*. It starts from an aging-report CSV and leaves invoicing in the firm's existing accounting system. Avoid promising that a reminder sequence or AI will recover a specific percentage of receivables.

## Qualify the first buyer

Interview the person who personally runs the weekly AR follow-up: usually an owner, operations lead, or part-time bookkeeper. Prioritize firms that (1) send enough invoices to lose track manually, (2) have several invoices overdue more than 30 days, (3) can export an aging report, (4) lack a dedicated AR platform, and (5) can decide on a modest software purchase. Exclude consumer debt collection and firms needing payment processing, legal escalation, or ERP integration as their first requirement.

## Discovery: learn before pitching

Run 20 qualified conversations across at least three service specialties. Recruit through bookkeeping advisers, B2B service-business associations, and targeted, permission-based outreach. Use the same questions and record answers without copying confidential invoice details:

1. Walk through the last three overdue invoices that needed more than a standard reminder. What stopped payment?
2. Where did the missing PO, disputed amount, approver, or promised date live? Who could see it?
3. What did you do next, and how long did it take? What was dropped or repeated?
4. How many open invoices and overdue customers do you handle in an ordinary month?
5. Which QuickBooks, Xero, spreadsheet, or AR features have you tried? Why did they fall short?
6. What would make you distrust a CSV import or a local browser tool?
7. If this board disappeared after two weeks, what would you return to? What would you miss?
8. Would you start a paid pilot at a stated price after trying it with your own workflow? Who approves that spend?

Count a problem as validated only when the buyer describes a recent incident, a current workaround, and its time or cash consequence. Praise for a demo is weaker evidence than an actual workflow change or payment commitment.

## First ten customers

| Stage | Action | Evidence required to advance |
| --- | --- | --- |
| 1. Prepare | Publish a clear demo, a sample aging CSV, import instructions, privacy/storage explanation, and a one-page AR blocker checklist. Test imports using synthetic and redacted records. | A new user can import, classify, and export without assistance; no silent data loss. |
| 2. Discover | Conduct 20 qualified interviews in small waves; record problem frequency, current tool, decision maker, and strongest objection. | At least 7 describe a recurring exception-tracking problem that existing tools have not solved. This threshold is an experiment target. |
| 3. Pilot | Offer 5 time-boxed, two-week pilots. Let each firm use its own export on its device; observe by screen share where possible. No customer data needs to be emailed to the builder. | At least 3 firms use it on two separate follow-up cycles and ask to continue. |
| 4. Charge | Offer a simple paid plan or explicitly priced manual pilot when the delivered product supports it. Record refusals and why. | At least 3 of 5 qualified pilot firms commit to the same published price, with no custom feature promise required. |
| 5. Repeat | Turn the strongest use case into a short case study with the customer's consent. Ask bookkeepers serving similar firms for introductions and repeat the same offer. | Reach 10 paying customers from a channel that can be run again without bespoke consulting. |

One practical channel hypothesis is bookkeeping firms: they already see AR aging and can introduce the product to clients whose follow-up process they manage. Another is a narrow service specialty with frequent purchase-order or approval delays. The preferred channel should be chosen from interview evidence, not assumed from search volume. Do not post unsolicited pitches in communities or represent a pilot as independent proof.

## Offer and pricing experiments

Start with a free demo using synthetic data. Test $29/month for one operator, with an optional $149 guided CSV/setup session. A $59/month team tier is a later test only if safe collaboration is built; the MVP has no team access. State clearly which capabilities exist at the time of sale; do not charge for future integrations or sync. Subscription value and entitlement for a local-only app also need to be tested. A paid pilot could be priced as a fixed two-week service if subscription billing is not yet implemented, but the buyer must receive a defined deliverable. Track whether buyers accept the price **after** using real workflow data, rather than asking for a hypothetical number on a call.

## Success, revision, and stop rules

These thresholds are decision aids for the first cohort, not claims about current performance.

| Measure | Initial target | Why it matters |
| --- | --- | --- |
| Activation | 80% of pilot users import a valid CSV and triage at least five invoices on day one. | Tests whether setup is genuinely light. |
| Repeat use | At least 3 of 5 pilots return for a second weekly follow-up cycle. | Distinguishes a useful habit from demo curiosity. |
| Follow-through | At least 80% of next actions entered by pilot users are completed or deliberately rescheduled. | Tests whether the board changes work, not just records it. |
| Paid demand | At least 3 of 5 qualified pilot firms agree to the same $29 monthly single-operator plan, or an explicitly priced equivalent pilot. | Tests willingness to pay at a repeatable offer. |
| Trust | No unreported import corruption; users can explain which records are current and reconcile payment status with their ledger. | Financial workflow errors can erase the value proposition. |

After 20 qualified interviews, revisit the ICP if fewer than 7 report the specific blocker-and-commitment pain. After five well-supported pilots, reconsider the product if fewer than two return for a second follow-up cycle or no one will pay a stated price. Before stopping, separate product failure from poor lead quality or import defects; fix a concrete defect and rerun a small pilot once. Avoid extending the experiment indefinitely without a paid signal.

## Measuring value honestly

Capture a baseline during each pilot: open invoices, aging buckets, time spent on weekly follow-up, number of unresolved blockers, and number of commitments missed. Compare the same measures after two cycles. Count cash as recovered only when the buyer confirms payment in the ledger; do not attribute all paid invoices to PromiseLedger. Report self-reported time savings separately from verified payment outcomes. Ask permission before publishing any identifiable result.

## Operating limits for the initial release

The proposed local-first workflow depends on the user's browser/device and manual CSV refresh. It may not provide multi-user coordination, automatic email sending, bank reconciliation, or a durable off-device backup. Explain the actual implemented behavior prominently before a pilot. Do not request raw customer invoices by email; prefer redacted samples and on-device import. A local-first interface can reduce credential-sharing needs, but it does not by itself prove security or compliance.

## Sources behind the plan

- [QuickBooks 2026 Late Payments Report](https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2026/): scale of overdue invoices in a vendor-commissioned US small-business survey.
- [QuickBooks automatic reminder documentation](https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/send-invoice-reminders-automatically-manually/L84cQjpxo_US_en_US) and [Xero AR product page](https://www.xero.com/us/accounting-software/accounts-receivable/): baseline capabilities buyers already have.
- [Upflow promise-to-pay documentation](https://support.upflow.io/hc/en-us/articles/32620736012945-Promise-to-pay), [Kolleno promise-to-pay documentation](https://help.kolleno.com/en/articles/7222293-promise-to-pay), and [Chaser pricing](https://www.chaserhq.com/chaser-pricing): current competing workflows and price context.
