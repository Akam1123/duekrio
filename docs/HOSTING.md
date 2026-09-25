# Public hosting and address

**Status, September 25, 2026:** Duenara is the provisional visible brand. The public prototype remains at the legacy [akam1123.github.io/promiseledger](https://akam1123.github.io/promiseledger/) address. A root-path package for a dedicated HTTPS hostname has been built and browser-tested locally. No new hostname has been claimed or deployed. No marketing has started.

## Choice and cost

Cloudflare Pages Free is the preferred host for this static browser app. It can assign a project URL such as `duenara.pages.dev/`, with no username or project path in the address. That exact name is **unreserved** until a Cloudflare project is created and confirmed. Cloudflare currently lists a free Pages tier and explains its [limits](https://developers.cloudflare.com/pages/platform/limits/) and [Git deployment](https://developers.cloudflare.com/pages/get-started/git-integration/). The free tier and terms may change. A conventional privately owned `.com` domain is not supplied for free by Pages; a custom domain would require lawful control of that domain.

The current [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) are a poor fit for operating a commercial SaaS. Its existing URL is a prototype fallback, not the proposed business host. [Cloudflare's self-serve terms](https://www.cloudflare.com/terms/) still place legal responsibility on the account holder; free hosting does not remove operator duties.

## Prepared deployment package

Once an exact HTTPS project hostname has been assigned, set `PUBLIC_ORIGIN` to its root URL with a trailing slash, then run:

```powershell
$env:PUBLIC_ORIGIN = 'https://the-claimed-name.pages.dev/'
npm ci
npm test
npm run build:hosted
```

The deployable directory is `dist-hosted/`. The build serves the app and content at `/`, rewrites canonical/social links and the 404 page, states Cloudflare Pages on the hosted privacy page, removes offline-only inline code, and adds Cloudflare Pages `_headers` with a strict CSP and other browser defenses. The normal `npm run build` still produces the existing GitHub Pages and offline distributions. `PUBLIC_ORIGIN` must be the exact assigned origin; a test build against a different address is not a live deployment.

For Git integration, connect only `Akam1123/promiseledger`, use `main` as the production branch, choose Node 22, set build command `npm run build:hosted`, output directory `dist-hosted`, and the `PUBLIC_ORIGIN` environment variable to the actual Pages URL. Cloudflare says its Git connection prompts for Git provider authorization, and its project name normally determines the hostname. A new account and GitHub authorization have not been performed in this task.

**Current access blocker:** GitHub is signed out in the browser used for Cloudflare's OAuth flow. The existing Git push credential is sufficient to update the repository but does not create a GitHub browser session or authorize Cloudflare. No Cloudflare account, project, DNS name, or paid plan has been created. A legitimate account-holder sign-in is required before this deployment can proceed; do not copy passwords or authentication codes into project files or chat. The sign-in flow was stopped when passkey authentication was unavailable.

The generated `_headers` includes `X-Robots-Tag: noindex, nofollow` while promotion is paused. Public visitors with the direct URL can still use the app. Remove that only when promotion is authorized and the legal/brand review is complete. The visible Duenara rename retains the legacy browser-storage key and accepts old PromiseLedger JSON backups; a hostname change still requires the export/restore step below.

## Verification before replacing the old link

1. Open the exact new HTTPS URL anonymously in a clean browser profile. Test home, sample board, CSV preview, privacy, terms, both guides, copy buttons, and an unknown URL. Test 320px, tablet, and desktop widths.
2. Check the actual HTTP response for `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`, and `X-Robots-Tag`. `_headers` in a local folder does not prove the provider sent them.
3. Confirm canonical/OG image URLs, favicon, internal links, and Cloudflare privacy disclosure use the new hostname. Ensure no third-party analytics, pixels, or application data requests appeared.
4. Keep the old app available for existing browser data. Browser `localStorage` is bound to its origin, so users must export JSON on the old host and restore it on the new one. Do not silently redirect or remove the old app before that route is clear.
5. Only after live verification, update the repository's primary link and any user-facing documentation. Keep marketing on hold until separately authorized.

The source review is in [SECURITY_AUDIT.md](SECURITY_AUDIT.md) and the operational/legal limits are in [LEGAL_RISK_REVIEW.md](LEGAL_RISK_REVIEW.md). Neither document is a legal opinion or a guarantee of safety.
