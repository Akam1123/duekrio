# AI-assisted marketing workflow

**Status: on hold.** The user has explicitly said not to begin promotion yet. Duekrio is a provisional name, not trademark-cleared. The live Cloudflare Pages release is at [https://duekrio.pages.dev/](https://duekrio.pages.dev/); point-in-time checks are in [HOSTING.md](../HOSTING.md). The site sends `noindex, nofollow`, lacks a private privacy-contact route, and has no paid plan. AI can prepare research organization, copy variants, editing, and analysis now. After a later explicit start instruction, the assistant will recheck the brand, host, live URL, facts, and usable free channels. The user has no campaign tasks. No account setup, OAuth connection, or paid service is assumed. Nothing in this repository posts to social networks or sends marketing mail automatically, and prospect invoices must not be processed with AI.

## Approved fact card (paste into each generation request)

> Product: Duekrio (provisional name), a free browser prototype. Public URL: https://duekrio.pages.dev/ (live Cloudflare Pages direct-upload site; recheck before distribution). Audience: small US B2B service firms and bookkeepers. It imports a flat AR aging CSV, records invoice blockers, owner labels, next actions and customer promise dates, creates an email draft a person reviews and sends, and exports CSV/JSON backup. A user may passphrase-encrypt a downloaded JSON backup and may opt in to encrypted local saves; default browser storage, CSV, and plain JSON remain readable. A prior readable browser copy remains until verified backup and explicit removal. There is no account, cloud sync, automatic email, accounting API, billing, or verified customer outcome. Data is stored in the user's browser on that device. Users should export a backup and verify balances and paid status in their accounting system. Do not claim customers, revenue, payment recovery, time savings, compliance, security certification, or features beyond this card. The sample data is fictional. Marketing has not started and the site asks search engines not to index it.

Update this card only after the product, live site, and documentation have been checked. If the site gains new capabilities, revise the copy and its limits together.

## Repeatable weekly production loop

1. **Start gate:** Do not publish, post, message, or schedule distribution before the user's later explicit start instruction. Then complete brand clearance appropriate to the intended market, recheck the live host, URL, product, and private contact route, and check which existing authorized channels are actually usable. The source targets the Duekrio root URL; verify the `build:hosted` artifact and live pages still match it. Change both the HTML `noindex, nofollow` tags and hosted `X-Robots-Tag` header only after that decision and another tested manual deploy. Skip unavailable channels without assigning the user a task.
2. **Collect evidence:** Note a real question, objection, or observed workflow problem from a consenting conversation if one exists. Remove names, invoice numbers, amounts, and company details. Record exact wording only with permission. Until then, use a clearly fictional scenario.
3. **Choose one audience question:** Examples: “What do I do with a disputed invoice?” or “How do I avoid losing follow-up notes on reimport?” Check the existing checklist and email-template pages first; improve one before creating a near-duplicate. Pick one question, not ten keyword variants.
4. **Generate a first draft:** Give AI the fact card, question, target channel, and format. Ask for two angles with factual caveats. Never upload raw buyer CSVs or private correspondence.
5. **Verify:** The assistant tests the described product path in the live app, checks every factual statement and linked source, removes invented outcomes, and reads the piece as the buyer would. Add a concrete fictional example or a real authorized observation.
6. **Publish once where appropriate:** After the start gate, the assistant can publish a useful guide on the existing owned site. A professional post or direct response is conditional on a relevant existing account, clear authority, and channel rules. Keep the exact published version and date in a private log. No social automation or mass messaging.
7. **Learn:** Summarize replies and pilot observations without identifying data; change the next content brief or product task based on repeated evidence. If no responses exist, record that fact instead of fabricating a theme.

## Prompts

### Product-claim audit

```text
You are a strict product copy reviewer. Compare the draft below with the approved fact card. Output a table with (1) exact draft phrase, (2) supported / unsupported / ambiguous, (3) reason, (4) safer replacement. Flag any implied automatic email, cloud sync, integrations, recovery rate, customers, revenue, security certification, or durable backup. Do not add new facts.

FACT CARD:
[paste approved fact card]

DRAFT:
[paste draft]
```

### One useful SEO article

```text
Write one helpful article for an owner or bookkeeper at a small US B2B service firm. Their question is: [one question from a real conversation]. Use the approved fact card. Include a worked fictional invoice example with remaining balance, blocker, owner, next action, and review date. Give the reader a workflow they can use even without this product. Include one natural link to the live demo and a plain storage/ledger caveat. Suggest a descriptive title and meta description. Do not fabricate statistics, testimonials, search volume, or results. Mark any external factual claims that require source checking as [VERIFY SOURCE].

FACT CARD:
[paste approved fact card]
```

### Social variants from an approved guide

```text
Turn this approved guide into two short posts for a professional audience. One should explain a common mistake; the other should show a fictional before/after workflow. Keep each under 180 words. Use the approved fact card. Make the product connection explicit and honest. Do not imply customer results. Do not create clickbait, engagement bait, or hashtags unless clearly useful. Output posts only, followed by a separate list of facts to recheck.

FACT CARD:
[paste approved fact card]

APPROVED GUIDE:
[paste guide]
```

### Anonymized research synthesis

```text
You are helping analyze opt-in discovery notes. Group the anonymized notes by recent concrete pain, current workaround, import/trust objection, and willingness to try a pilot. Separate direct evidence from inference. Count a theme only when it appears in distinct conversations. Quote no identifiable details. End with the top three product or copy changes and the evidence for each. Do not infer market size or revenue.

ANONYMIZED NOTES:
[paste notes with names, companies, customers, invoice numbers, and amounts removed]
```

### Source and accessibility review for a finished page

```text
Review this page copy for a small-business reader. Identify claims that need a source, unsupported implications, unexplained jargon, a missing action, and places where an image would need descriptive alt text. Use the approved fact card. Do not invent source URLs. Return a prioritized edit list, not a replacement page.

FACT CARD:
[paste approved fact card]

PAGE COPY:
[paste copy]
```

## AI output gate

No generated content is published before the start gate. At publication time, the assistant checks product truth, live links, source relevance and date, spelling, accessibility, privacy, tone, and channel rules. [Google's people-first guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) favors original, useful work; AI-assisted drafting is not a license to publish many thin pages. The company must be candid if a reader would reasonably expect to know how content was produced.
