# Incident response — Duekrio early access

**Scope:** the public static site, repository, deployment accounts, and browser-only invoice workspace. This is an operating checklist to use during an actual event, not proof that an event occurred or that notice rules apply. Keep it with the [security audit](SECURITY_AUDIT.md) and [legal review](LEGAL_RISK_REVIEW.md).

## First actions

1. Record when and how the issue was found, the affected URL, visible symptoms, reporter, and the current deployed commit. Preserve screenshots and relevant deployment logs. Do not put customer records or secrets into a public GitHub issue.
2. If a release may run malicious code, stop further deployments and remove that release from public service or roll back to a **verified** earlier commit. Keep the evidence and a copy of the suspect build. On Cloudflare Pages, use its [deployment rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/) and account audit controls; on GitHub Pages, review the workflow and branch before redeploying.
3. Revoke or rotate any suspected GitHub, hosting, or automation credentials using the providers' account-security controls. Review active sessions and connected applications. Do not copy tokens into support messages or logs.
4. Check whether the issue could have exposed browser-local invoice data. Default and older browser copies are readable `localStorage`; optional encrypted local saves can still be exposed while unlocked or by code executing on the site's origin. Optional encrypted JSON backup files do not protect readable browser copies. Readable JSON backups and CSV exports remain plaintext, while encrypted JSON backups need their passphrase. Determine the earliest affected release, which pages were served, any unexpected outbound requests, and the plausible visitor set. The static app has no server-side invoice database, so do not claim it had one or that no user data could have been affected.

## Triage and notification

- Identify the actual operator, jurisdictions, customer relationships, categories of personal data, incident timeline, likely exposure, and existing contractual promises. Preserve evidence and seek qualified legal/security advice for applicable notice deadlines and recipients. The [FTC small-business guide](https://www.ftc.gov/business-guidance/resources/data-breach-response-guide-business) and [Israeli authority's serious-incident reporting service](https://www.gov.il/he/service/report-of-data-breach) are starting points where applicable, not universal deadlines.
- Prepare a plain factual notice only after confirming the known facts: what happened, what data may be affected, what has been contained, what visitors can do with local backups, and how updates will be provided. Do not make unsupported assurances that data was never accessed or that a fix eliminates all risk.
- GitHub [private vulnerability reporting](https://github.com/Akam1123/duekrio/security/advisories/new) is available for software security findings. The [privacy page](../public/privacy/index.html) now lists an email for private customer and privacy requests; its delivery has not been tested, and a full legal operator identity has not been verified. Public GitHub Issues are unsuitable for confidential customer reports. Confirm the real recipient and applicable notice duties during an incident; see [LEGAL_RISK_REVIEW.md](LEGAL_RISK_REVIEW.md).

## Recovery

1. Rebuild from a reviewed source commit with `npm ci`, `npm audit --audit-level=high`, `npm test`, and the appropriate production build. Review dependency and GitHub Actions changes. Verify the deployed commit, files, canonical URL, privacy copy, and actual HTTP security headers.
2. Test the home page, import/restore, backup/download, legal pages, guides, copy action, mobile, and a clean anonymous browser. Confirm no unexpected network destination appears.
3. Reopen deployment only after the cause is understood and the fix verified. Keep a timeline, decisions, affected versions, notice records, and follow-up controls for later review.

Do not use this checklist to delay urgent containment or any legally required notice.
