# PromiseLedger: market thesis

Research checked 25 September 2026. This is a **testable business hypothesis**, not evidence of product-market fit or a revenue forecast.

## Who has the problem

Start with owner-led B2B service firms with roughly 5–30 staff, 20–200 open invoices per month, and no dedicated collections team. Examples include small consultancies, implementation firms, and creative or technical agencies. The narrower entry point is a firm already invoicing in QuickBooks or Xero that still uses a spreadsheet, inbox, or weekly meeting to answer: *Which overdue invoices are blocked, who must act, and when has the customer promised to pay?* The staff and invoice bands are targeting assumptions to test, not published market counts.

PromiseLedger's proposed job is to turn an accounts-receivable aging export into a follow-up queue: record the reason for delay, the person responsible, next action, payment commitment, and outcome. Its value must come from making exceptions visible and moving them toward resolution. Routine reminder emails are already built into accounting products.

## Evidence and its limits

| Observation | What it supports | What it does **not** establish |
| --- | --- | --- |
| [Intuit QuickBooks' 2026 US small-business report](https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2026/) says 59% had invoices more than 30 days overdue; businesses with unpaid invoices were owed $17,700 on average. | Late payment is widespread and financially relevant. | That these firms need another app, or that PromiseLedger would collect the money. The survey is commissioned by a vendor with an interest in the category. |
| [QuickBooks Online](https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/send-invoice-reminders-automatically-manually/L84cQjpxo_US_en_US) offers up to three scheduled invoice reminders, while [Xero](https://www.xero.com/us/accounting-software/accounts-receivable/) also offers late-payment reminders and aging visibility. | A generic reminder product has a weak wedge. | That users are satisfied with the process after a buyer disputes an invoice or makes a payment commitment. |
| [Chaser's published pricing](https://www.chaserhq.com/chaser-pricing) starts at $259/month for its Compact software plan in the US; its Care service, which includes payment-query and dispute management, starts at $1,199/month. | More involved collections workflows can support meaningful spend. | That a small firm will pay for a standalone local tool. Chaser includes much more software and human service. |

The core **inference** is that a small firm may value a simple exception board between built-in reminders and a full AR platform. This needs direct buyer validation. No customer interviews, pilots, conversion data, or paid commitments are represented here.

## Competition

| Alternative | Verified capability | Consequence for PromiseLedger |
| --- | --- | --- |
| [QuickBooks Online](https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/send-invoice-reminders-automatically-manually/L84cQjpxo_US_en_US), [Xero](https://www.xero.com/us/accounting-software/accounts-receivable/) | Invoice status, aging information, and automatic reminders. | Stay beside the existing ledger; avoid rebuilding invoicing, payment acceptance, or generic nudges. |
| [Upflow](https://upflow.io/accounts-receivable-management-software) | Shared collection timeline, disputes, customer portal, payment links, and explicit [promise-to-pay tracking](https://support.upflow.io/hc/en-us/articles/32620736012945-Promise-to-pay). | Promise tracking itself is an existing feature, not a new category. |
| [Kolleno](https://help.kolleno.com/en/articles/7222293-promise-to-pay) | Promise-to-pay records and follow-up notifications. | Do not claim a unique algorithm or workflow for commitments. |
| [Chaser](https://www.chaserhq.com/chaser-pricing) | AR workflows, forecasting, and optional managed dispute handling. | Compete on fast setup and suitability for smaller teams, subject to proof from buyers. |
| Spreadsheet plus inbox | Flexible, already owned, and easy to start. | Product must beat the spreadsheet in clarity and follow-through without creating reconciliation work. |

Potential differentiation is **local-first operation, CSV-first onboarding, no ledger credentials, and a focused blocker-to-next-action workflow**. These are product-design choices; they are not a moat until customers prefer them and continue paying. Local-only storage also limits collaboration and makes backup and device loss material concerns.

## Pricing and market size

Test $29/month for one operator *only after* the product supports a repeatable workflow worth paying for. A $59/month team plan is a later hypothesis that depends on shipping safe collaboration; the local MVP has no team access. Consider a $149 guided setup offer for firms with messy aging exports, while keeping access to their financial data under their control. These are hypotheses, not current prices or existing billing features. Subscription value and entitlement for a local-only app also need validation. Compare willingness to pay with the buyer's actual cost of manual chasing and blocked cash; do not infer it from Chaser's price.

Avoid an unsupported top-down TAM claim. After 20 qualified interviews, estimate the reachable market from the share of firms meeting the invoice-volume, tooling, and pain criteria, then test acquisition cost through one repeatable channel. A sample arithmetic scenario—50 customers at $29/month equals $1,450 monthly recurring revenue—illustrates unit economics only; it is not a forecast.

## Product and claim boundaries

- A CSV export can be stale, malformed, or incomplete. Paid status must be checked against the ledger before action; the app should never be treated as the financial system of record.
- A promise-to-pay date is a customer's statement, not guaranteed cash or a reliable forecast by itself.
- If the MVP runs only in one browser, collaboration, backup, and cross-device use are limited. Verify the implemented storage and export behavior before stating that customer data stays on device.
- No automated email delivery, bank connection, payment processing, accounting advice, or legal collections service should be implied without those capabilities being built and checked.
- Revenue lift requires measured paid outcomes with a credible baseline. The number of items moved through the board is an activity metric, not recovered cash.

## Falsifiable thesis

The business earns a place if owners repeatedly use the board for invoices that standard reminders did not resolve, can complete the work faster or with fewer dropped follow-ups, and commit to paying for that improvement. If buyers can do the same work comfortably in their accounting product or existing spreadsheet, the wedge is too small.
