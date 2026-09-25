# Public hosting and address

**Status, September 25, 2026:** The new Cloudflare Pages Free direct-upload site is live at [https://duekrio.pages.dev/](https://duekrio.pages.dev/), with public source at [Akam1123/duekrio](https://github.com/Akam1123/duekrio). The earlier [Duenara site](https://duenara.pages.dev/) remains on its own Cloudflare origin, and the [GitHub Pages address](https://akam1123.github.io/promiseledger/) remains a legacy migration fallback. Marketing has not started.

## Choice and cost

Cloudflare Pages Free can serve this static browser app at a dedicated HTTPS subdomain with no username or project path. Cloudflare publishes [Pages Free limits](https://developers.cloudflare.com/pages/platform/limits/); the free tier and terms may change. A `pages.dev` address is a usable public address once deployed, but is not ownership of a privately registered domain. A custom domain requires lawful control of that domain. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) make the old path a poor fit for a commercial SaaS; it is retained so visitors can export browser data. [Cloudflare's self-serve terms](https://www.cloudflare.com/terms/) still place responsibility on the account holder.

## Release procedure

Build from reviewed source for the new host:

```powershell
$env:PUBLIC_ORIGIN = 'https://duekrio.pages.dev/'
npm ci
npm test
npm audit --audit-level=high
npm run build:hosted
```

Review `dist-hosted/`, its generated canonical/social links and privacy host disclosure, the noindex and security headers in `_headers`, and the actual app/backup flows before uploading. Upload that exact directory to the `duekrio` Pages project's `main` production branch. With Wrangler authenticated to the correct Cloudflare account, an upload from a clean checkout of the reviewed commit can use:

```powershell
$reviewedCommit = (git rev-parse HEAD).Trim()
npx wrangler pages deploy dist-hosted --project-name duekrio --branch main --commit-hash $reviewedCommit
```

Only pass `--commit-hash` when the built files match that commit; a dirty tree means the hash may misdescribe the deployed files. GitHub push and CI do not publish this direct-upload project. [Cloudflare says a Direct Upload project cannot be converted to Git integration](https://developers.cloudflare.com/pages/get-started/direct-upload/). A later CI upload would need a reviewed workflow and a restricted Pages Edit token kept in GitHub Actions secrets. No Cloudflare credential belongs in this repository.

The source and normal build now target the Duekrio root path `/`. The hosted build writes canonical/social URLs for `PUBLIC_ORIGIN`, keeps the Cloudflare Pages disclosure, removes offline-only inline code, and writes a strict CSP and other response headers. `npm run build` also creates standalone offline files under the new name and both old filename aliases. The old PromiseLedger repository and GitHub Pages deployment remain unchanged for migration; this new source repo has no GitHub Pages deployment workflow.

## Keep both old origins usable for migration

Browser `localStorage` belongs to an origin. The GitHub Pages, old Duenara Cloudflare, and new Duekrio Cloudflare URLs are three distinct storage origins. A user must open the address where the work was saved, unlock it if necessary, download a JSON backup, restore it at Duekrio, and verify the restored records before removing the old copy. CSV alone does not preserve the whole workspace. Do not automatically redirect or remove either old workspace.

A compatibility release was uploaded to the **existing** `duenara` Pages project's `main` branch from the same reviewed source commit. It retains backup/export and restore, links to Duekrio with migration steps, uses canonical/social URLs for its own origin, and explains the older address on its privacy page. The old PromiseLedger GitHub Pages deployment remains available in its prior repository for export. The old Cloudflare origin's live sample workspace exported a JSON backup that was restored on the new Duekrio origin; this test used a fresh browser context and did not access an existing visitor's data. The locked-workspace code is shared between both hosted builds and was tested on Duekrio, but a preexisting visitor's locked data cannot be verified without that visitor's browser and passphrase.

Both Cloudflare deployments include `X-Robots-Tag: noindex, nofollow` while promotion is paused. That header asks search engines not to index the pages; it does not make them private. Remove it only after the owner starts promotion and the brand/legal review is complete.

## Verification and earlier release history

For **each** upload, check live home, app, privacy, terms, resources, guide pages, unknown routes, mobile layout, backup/restore, canonical/OG URLs, and response headers. Confirm the site serves the reviewed build; a local test or CI pass is not evidence of a successful Cloudflare upload. Record the checked URL, time, commit/build, and outcome here after deployment.

On 26 September 2026, source commit `bbd8bf4e8e65ec0d836fcb9045c65040ccde921a` was deployed to the `duekrio` Pages production branch. The [kit preview](https://duekrio.pages.dev/resources/invoice-exception-kit/) and [full license](https://duekrio.pages.dev/resources/invoice-exception-kit/license/) both returned HTTP 200 with canonical URLs and `X-Robots-Tag: noindex, nofollow`; the preview displayed its no-sale status and private contact. The existing six-page live Playwright suite passed, including CSP, accessibility automation, copy action, 320–1440 px layouts, 404, and browser-error checks. GitHub verify and CodeQL had passed before deployment. These are point-in-time checks, not a merchant approval or a security guarantee. No checkout was enabled.

On 26 September 2026, the Duekrio `main` direct-upload release was built from source commit `e84296ba8d43f73d2f42fda1db265c3273e070d7` and deployed to [duekrio.pages.dev](https://duekrio.pages.dev/). Live checks returned HTTP 200 with the intended CSP and `noindex` header; a six-page Playwright suite passed, including mobile widths, accessibility checks, copy action, and 404. The privacy and terms pages showed the operator and private-contact copy. This is point-in-time evidence for that release. Any later source change, including the invoice kit preview page, needs its own upload and live verification before it can be called published.

The earlier Duekrio `main` direct-upload release was built from source commit `242c7879cd8af7a9ebc8882fcc2ce84489d2bd36` and published at [duekrio.pages.dev](https://duekrio.pages.dev/) on 25 September 2026. A live HTTP check returned 200 with the intended CSP, HSTS, `nosniff`, framing restriction, and `X-Robots-Tag: noindex, nofollow`. Live browser checks passed six pages, the 404 page, the sample copy action, canonical metadata, 320–1440 px layouts, accessibility automation, and browser errors. The full six-scenario encrypted-workspace regression passed on the deployed release. A separate deterministic browser test confirmed that a delayed wrong or right raw-file read cannot override the latest verification attempt. Main CI and CodeQL also passed for this commit. These checks are point-in-time evidence, not certification.

The current Duenara `main` compatibility direct upload was built from the same source commit `242c7879cd8af7a9ebc8882fcc2ce84489d2bd36` and published at [duenara.pages.dev](https://duenara.pages.dev/) on 25 September 2026. Live browser checks passed the six content pages, 404, CSP/noindex headers, canonical metadata, sample copy action, 320–1440 px layouts, and accessibility automation. The deterministic raw-file verification test passed on this host too. A fresh-browser sample backup exported on Duenara and restored on Duekrio. Existing browser storage on either origin was not read or removed.

Earlier on 25 September 2026, the `duenara` direct-upload project's `main` branch received the tested hosted build for Git commit `21141c6`. At that time its live home and privacy pages returned HTTP 200 with `https://duenara.pages.dev/` canonical links, Cloudflare disclosure, the intended security headers and `noindex, nofollow`. A live browser check passed the fictional sample board, mobile layout, and JSON backup/restore flow. Those are historical, point-in-time checks of that earlier release, not verification of Duekrio or a future upload.

See [SECURITY_AUDIT.md](SECURITY_AUDIT.md), [LEGAL_RISK_REVIEW.md](LEGAL_RISK_REVIEW.md), and [BRAND.md](BRAND.md) for the current limits. None is a guarantee of safety or a legal opinion.
