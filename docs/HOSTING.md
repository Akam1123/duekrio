# Public hosting and address

**Status, September 25, 2026:** The new Cloudflare Pages Free direct-upload project `duekrio` has been created for [https://duekrio.pages.dev/](https://duekrio.pages.dev/). This document does not claim that a Duekrio build has been uploaded or verified yet. The earlier [Duenara site](https://duenara.pages.dev/) remains on its own Cloudflare origin, and the [GitHub Pages address](https://akam1123.github.io/promiseledger/) remains a legacy migration fallback. Marketing has not started.

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

After Duekrio is uploaded and checked, build a compatibility release for the **existing** `duenara` Pages project with `PUBLIC_ORIGIN=https://duenara.pages.dev/` and upload it to that project's `main` branch. That build must retain backup/export and restore in place, and clearly link to Duekrio with migration steps. Its canonical/social links must identify its own actual host; the privacy page must explain that it is the older Cloudflare origin. Test old data, including any locked workspace, before replacing the old deployment. The old PromiseLedger GitHub Pages deployment stays available in its prior repository for export.

Both Cloudflare deployments include `X-Robots-Tag: noindex, nofollow` while promotion is paused. That header asks search engines not to index the pages; it does not make them private. Remove it only after the owner starts promotion and the brand/legal review is complete.

## Verification and earlier release history

For **each** upload, check live home, app, privacy, terms, resources, guide pages, unknown routes, mobile layout, backup/restore, canonical/OG URLs, and response headers. Confirm the site serves the reviewed build; a local test or CI pass is not evidence of a successful Cloudflare upload. Record the checked URL, time, commit/build, and outcome here after deployment.

Earlier on 25 September 2026, the `duenara` direct-upload project's `main` branch received the tested hosted build for Git commit `21141c6`. At that time its live home and privacy pages returned HTTP 200 with `https://duenara.pages.dev/` canonical links, Cloudflare disclosure, the intended security headers and `noindex, nofollow`. A live browser check passed the fictional sample board, mobile layout, and JSON backup/restore flow. Those are historical, point-in-time checks of that earlier release, not verification of Duekrio or a future upload.

See [SECURITY_AUDIT.md](SECURITY_AUDIT.md), [LEGAL_RISK_REVIEW.md](LEGAL_RISK_REVIEW.md), and [BRAND.md](BRAND.md) for the current limits. None is a guarantee of safety or a legal opinion.
