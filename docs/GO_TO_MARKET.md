# Duekrio: first-customer plan

Plan drafted 25 September 2026. Duekrio is a free prototype live at [duekrio.pages.dev](https://duekrio.pages.dev/) on Cloudflare Pages; point-in-time release checks are in [HOSTING.md](HOSTING.md). The name remains provisional pending trademark checks. **Marketing and outreach are on hold until the user's later explicit start instruction.** This document describes future validation and distribution; no prospects have been contacted and no customers or revenue are claimed.

## Positioning

For small B2B service firms with overdue invoices, Duekrio is a focused workspace for recording *why payment is stuck, who owns the next step, and what the customer committed to do*. It starts from an aging-report CSV and leaves invoicing in the firm's existing accounting system. Avoid promising that a reminder sequence or AI will recover a specific percentage of receivables.

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

The [ranked distribution experiments](marketing/CHANNEL_RANKING.md) specify where to test for qualified buyers after the site and trust gates pass. They remain on hold with all other marketing activity.

| Stage | Action | Evidence required to advance |
| --- | --- | --- |
| 1. Prepare | Publish a clear demo, a sample aging CSV, import instructions, privacy/storage explanation, and a one-page AR blocker checklist. Test imports using synthetic and redacted records. | A new user can import, classify, and export without assistance; no silent data loss. |
| 2. Discover | Conduct 20 qualified interviews in small waves; record problem frequency, current tool, decision maker, and strongest objection. | At least 7 describe a recurring exception-tracking problem that existing tools have not solved. This threshold is an experiment target. |
| 3. Pilot | Offer 5 time-boxed, two-week pilots. Let each firm use its own export on its device; observe by screen share where possible. No customer data needs to be emailed to the builder. | At least 3 firms use it on two separate follow-up cycles and ask to continue. |
| 4. Charge | Once the distinct downloadable kit is finished and a provider approves the real operator and product, offer it at one transparent one-time test price. Record actual orders, refusals, and why. Do not charge for the free app or an unbuilt SaaS feature. | At least 3 of 5 qualified firms choose the same published kit price without a custom feature promise; this is an experiment target, not a current result. |
| 5. Repeat | Turn the strongest use case into a short case study with the customer's consent. Ask bookkeepers serving similar firms for introductions and repeat the same offer. | Reach 10 paying customers from a channel that can be run again without bespoke consulting. |

One practical channel hypothesis is bookkeeping firms: they already see AR aging and can introduce the product to clients whose follow-up process they manage. Another is a narrow service specialty with frequent purchase-order or approval delays. The preferred channel should be chosen from interview evidence, not assumed from search volume. Do not post unsolicited pitches in communities or represent a pilot as independent proof.

## Offer and pricing experiments

Start with the free demo using synthetic data. The first paid hypothesis is a **$39 one-time B2B Invoice Exception Resolution Kit**: original editable team procedures, decision cards, message drafts, and fictional cases delivered as files, usable without the free app. Its package and license must be checked, and the actual operator and product category approved by a payment provider before any checkout; the [billing plan](BILLING.md) describes the prerequisites. The price is a test, not a live offer. A **$29/month single-operator Pro** plan is a later hypothesis only after a distinct recurring benefit works; a **$59/month team tier** is later still and requires safe collaboration. The present owner field is a local label, not team access. Do not charge for future integrations, sync, or the existing MIT-licensed client bundle behind a bypassable paywall. Track actual purchases or explicit refusals at a stated price, not compliments about a hypothetical product.

## Success, revision, and stop rules

These thresholds are decision aids for the first cohort, not claims about current performance.

| Measure | Initial target | Why it matters |
| --- | --- | --- |
| Activation | 80% of pilot users import a valid CSV and triage at least five invoices on day one. | Tests whether setup is genuinely light. |
| Repeat use | At least 3 of 5 pilots return for a second weekly follow-up cycle. | Distinguishes a useful habit from demo curiosity. |
| Follow-through | At least 80% of next actions entered by pilot users are completed or deliberately rescheduled. | Tests whether the board changes work, not just records it. |
| Paid demand | After the kit and merchant route are genuinely live, at least 3 of 5 qualified firms buy the same $39 one-time kit without custom promises. Treat any earlier stated intention as weaker evidence than an order. | Tests willingness to pay for the first distinct deliverable. Recurring SaaS demand remains untested. |
| Trust | No unreported import corruption; users can explain which records are current and reconcile payment status with their ledger. | Financial workflow errors can erase the value proposition. |

After 20 qualified interviews, revisit the ICP if fewer than 7 report the specific blocker-and-commitment pain. After five well-supported pilots, reconsider the product if fewer than two return for a second follow-up cycle or no one will pay a stated price. Before stopping, separate product failure from poor lead quality or import defects; fix a concrete defect and rerun a small pilot once. Avoid extending the experiment indefinitely without a paid signal.

## Measuring value honestly

Capture a baseline during each pilot: open invoices, aging buckets, time spent on weekly follow-up, number of unresolved blockers, and number of commitments missed. Compare the same measures after two cycles. Count cash as recovered only when the buyer confirms payment in the ledger; do not attribute all paid invoices to Duekrio. Report self-reported time savings separately from verified payment outcomes. Ask permission before publishing any identifiable result.

## Operating limits for the initial release

The local-first workflow depends on the user's browser/device and manual CSV refresh. It has no multi-user coordination, automatic email sending, bank reconciliation, or automatic off-device backup. A downloaded JSON backup is user-managed; it must be stored under the firm's own policy. Explain the actual implemented behavior prominently before a pilot. Do not request raw customer invoices by email; prefer redacted samples and on-device import. A local-first interface can reduce credential-sharing needs, but it does not by itself prove security or compliance.

## Sources behind the plan

- [QuickBooks 2026 Late Payments Report](https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2026/): scale of overdue invoices in a vendor-commissioned US small-business survey.
- [QuickBooks automatic reminder documentation](https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/send-invoice-reminders-automatically-manually/L84cQjpxo_US_en_US) and [Xero AR product page](https://www.xero.com/us/accounting-software/accounts-receivable/): baseline capabilities buyers already have.
- [Upflow promise-to-pay documentation](https://support.upflow.io/hc/en-us/articles/32620736012945-Promise-to-pay), [Kolleno promise-to-pay documentation](https://help.kolleno.com/en/articles/7222293-promise-to-pay), and [Chaser pricing](https://www.chaserhq.com/chaser-pricing): current competing workflows and price context.
