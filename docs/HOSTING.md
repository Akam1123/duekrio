# Public hosting and address

**Status, September 25, 2026:** The primary public site is [https://duenara.pages.dev/](https://duenara.pages.dev/), a Cloudflare Pages Free project. The tested hosted build for Git commit `21141c6` was deployed by **direct upload** to the project's `main` production branch. The old [GitHub Pages address](https://akam1123.github.io/promiseledger/) remains accessible as a migration fallback. No marketing has started.

## Choice and cost

Cloudflare Pages Free hosts this static browser app at a dedicated HTTPS subdomain with no username or project path. Cloudflare publishes [Pages Free limits](https://developers.cloudflare.com/pages/platform/limits/); the free tier and terms may change. This `pages.dev` subdomain is a usable public address, but it is not ownership of a privately registered `.com` or other custom domain. A custom domain requires lawful control of that domain.

The [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) make that free service a poor fit for operating a commercial SaaS; its existing URL is retained for backup export, not as the primary business host. [Cloudflare's self-serve terms](https://www.cloudflare.com/terms/) still place legal responsibility on the account holder; free hosting does not remove operator duties.

[Netlify Free](https://www.netlify.com/blog/introducing-netlify-free-plan/) remains a possible fallback, not an active deployment. Switching providers would require a fresh review of its limits, headers, and privacy disclosure.

## Initial verified release and subsequent deployments

The project name and URL are now known. To prepare a later release from a reviewed commit, set `PUBLIC_ORIGIN` to the exact production URL and run these commands from the repository root:

```powershell
$env:PUBLIC_ORIGIN = 'https://duenara.pages.dev/'
npm ci
npm test
npm audit --audit-level=high
npm run build:hosted
```

Upload the resulting `dist-hosted/` directory to the existing **Duenara Cloudflare Pages direct-upload project** on its `main` production branch, then verify the public response again. With Wrangler authenticated to the correct Cloudflare account, a reproducible upload from a **clean checkout of the same reviewed commit used for the build** is:

```powershell
$reviewedCommit = (git rev-parse HEAD).Trim()
npx wrangler pages deploy dist-hosted --project-name duenara --branch main --commit-hash $reviewedCommit
```

Check `git status --short` before building and uploading; a dirty tree means the commit hash may not describe the deployed files. The hosted build serves content at `/`, rewrites canonical/social links and the 404 page, states Cloudflare Pages on the hosted privacy page, removes offline-only inline code, and writes `_headers` with a strict CSP and other browser defenses. The normal `npm run build` still produces the GitHub Pages and offline distributions. Keep `PUBLIC_ORIGIN` equal to the exact production origin; a local build is not itself a deployment.

The project is **direct upload, not Git-integrated**. GitHub push and CI do not update `duenara.pages.dev`; a tested build must be uploaded manually until a separate deployment integration is configured and verified. Do not treat a GitHub Actions success badge as evidence that Cloudflare is serving the new commit. [Cloudflare says a Direct Upload project cannot be converted to Git integration](https://developers.cloudflare.com/pages/get-started/direct-upload/). To automate uploads to **this same project**, use [Cloudflare's Direct Upload CI procedure](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/) with a Cloudflare Pages Edit API token and account ID kept in GitHub Actions secrets, limited to the required project/account scope where the provider permits it, and a reviewed workflow that builds and deploys `dist-hosted/` from `main`. A separate new Git-integrated Pages project is the alternative if native Git integration is required; that would need a new URL/migration review. Neither route is configured now.

No Cloudflare API token or deployment credential belongs in the repository. The owner-authorized account and project exist; any future account authentication must use the provider's legitimate flow, without putting passwords or codes into project files or chat.

The new address is an actual Cloudflare Pages deployment, not a temporary Worker preview or a DNS alias to GitHub Pages.

The live `_headers` includes `X-Robots-Tag: noindex, nofollow` while promotion is paused. Public visitors with the direct URL can use the app, but search engines are asked not to index it. Remove that directive only when promotion is authorized and the legal/brand review is complete. The visible Duenara rename retains the legacy browser-storage key and accepts old PromiseLedger JSON backups; the hostname change still requires export and restore.

## Verification recorded for the initial release

1. The live home and `/privacy/` pages returned HTTP 200. Their canonical/privacy links use `https://duenara.pages.dev/`; the privacy page names Cloudflare Pages as host.
2. The live response sent `Content-Security-Policy` with `script-src 'self'`, `connect-src 'none'`, and `frame-ancestors 'none'`, plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, HSTS, a referrer policy, a permissions policy, and `X-Robots-Tag: noindex, nofollow`. This confirms the policy at the checked URLs and time, not every future release.
3. A live browser check passed the fictional sample board, mobile layout, and JSON backup/restore flow. This is functional smoke testing, not a penetration test or guarantee across all browsers.
4. The old app remains available because browser `localStorage` is tied to its origin. Existing visitors can export JSON on the old host and restore it on the new one. Do not silently redirect or remove that route before migration is clear.
5. Recheck root, app, privacy, terms, resources, guide pages, unknown routes, mobile layout, backup/restore, canonical/OG URLs, and real response headers after **each manual upload**. Keep marketing on hold until separately authorized.

The source review is in [SECURITY_AUDIT.md](SECURITY_AUDIT.md) and the operational/legal limits are in [LEGAL_RISK_REVIEW.md](LEGAL_RISK_REVIEW.md). Neither document is a legal opinion or a guarantee of safety.
