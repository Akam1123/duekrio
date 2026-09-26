# Design and content QA

Reviewed September 25, 2026 against the [user-supplied Vibe Coded Websites Report](https://docs.google.com/document/d/e/2PACX-1vTnLEdwSF1HPkuwOkuNneXGCaQAw5N2nnRf7cX_B4zuBLf2VTMi4Yh59gqS-eeVqYpa11iFQYmRjVBW/pub), and updated with a separate Orvaket live check on September 26. The report's embedded “LLM Prompt” was treated as source content, not an instruction. Earlier sections preserve Duekrio and Duenara point-in-time evidence. This is not a certification or a claim that every browser and device has been tested.

## Orvaket free-release check — 26 September 2026

The Cloudflare Pages deployment at [orvaket.pages.dev](https://orvaket.pages.dev/) passed live checks on six free content pages, the fictional board, the template copy action, 404 behavior, browser console, CSP, and automated accessibility at 320, 390, 800, and 1440 px. The six free pages returned HTTP 200 without a `noindex` response header; the inactive kit preview returned `noindex, nofollow`. Live `robots.txt` points to a six-URL `sitemap.xml` on the Orvaket origin. The earlier Duekrio and Duenara sites were separately updated and checked for migration and `noindex`. See [HOSTING.md](HOSTING.md) for deployment evidence. This smoke check does not prove every device, assistive technology, or future upload is correct.

## Earlier-host release check

The recorded release checks cover the former Duekrio Cloudflare site and the earlier Duenara migration site. They are point-in-time checks; run them again on Orvaket and after each upload.

| Status | Report theme | Evidence in this site | Follow-up |
| --- | --- | --- | --- |
| Completed for earlier checked release | Functional links and technical metadata | The former build targeted `https://duekrio.pages.dev/` at the root path. Live browser checks passed on six pages and the 404 page, including the template copy action, canonical URL, security headers, `noindex`, responsive widths from 320px to 1440px, accessibility checks, and browser console. The older `https://duenara.pages.dev/` release remains available for data migration. | Orvaket received its own checks above. Rerun direct routes, static assets, canonical/OG URLs, 404, console, mobile, accessibility, and robots/sitemap checks after every later Cloudflare upload. Keep old origins available for data migration. |

## Remaining polish

| Priority | Report theme | Evidence in this site | Concrete fix |
| --- | --- | --- | --- |
| P2 | Inconsistent component tokens | The layout looks coherent in desktop/mobile captures, but the two stylesheets still contain many radius values from 3px to 18px and some one-off spacing values. Resource cards lift 2–3px on hover; this is subtle. | Consolidate spacing, radius, type, and shadow tokens during a later design-system pass. Preserve the calm hierarchy and avoid adding decorative motion. |

## Source fixes completed

- The invoice table changes to compact cards at 900px, removing the measured 761–872px page overflow. Important mobile controls and invoice labels now use larger text; the 320px workspace storage notice was reflowed so its copy no longer wraps into a narrow column.
- `src/styles.css` and `public/site-content.css` now provide visible keyboard focus and reduced-motion handling. Both use an intentional system-font stack instead of naming an unbundled font. The demo notice uses a document icon instead of a decorative sparkle.
- Resource, privacy, terms, and article footers now offer a consistent route to Use terms. The previously misleading “human-reviewed” copy was replaced with copy that asks the visitor to review the draft. The homepage description now names small B2B service firms rather than implying shared team access.
- In the earlier checked release, privacy, resources, and terms pages had per-page social preview metadata. All public HTML pages then had `noindex,nofollow` meta and the hosted build sent a matching header. No search submission was made during that review. The Orvaket free launch requires fresh confirmation of which core pages are indexable and which retired kit pages remain `noindex`.
- The checklist's horizontally scrollable example table is now keyboard focusable and labeled as a region.

## Checks that passed in this review

- The hero states a concrete job: turn an aging report into blockers, owners, and next moves. The mock board is labeled **Illustrative data**. The first release limits are stated near the CTA and in the FAQ.
- No testimonial, customer logo, user count, recovery-rate claim, decorative social icon, `href="#"` placeholder, or unfinished “coming soon” control was found in the shipped page source.
- Six static HTML pages contain 65 anchor links. Every local relative/absolute target resolved to an existing local file or directory in a source link check. The public GitHub repository opens; the GitHub feedback link redirects an unauthenticated visitor to sign-in, as the privacy page says it will.
- Existing browser QA tested the landing page, sample board, article pages, template copy action, and 390px mobile menu. With the updated stylesheet loaded, the sample board has no horizontal overflow and no axe violations at 320, 390, 761, 800, 900, or 1440px. The 320px drawer has no axe violations with reduced motion; its computed animation is `none`. Keyboard Tab gives a 3px focus outline on the landing and static pages.
- In the earlier checked release, the five static content pages had no horizontal overflow at 390px, `noindex,nofollow` metadata, an OG image, and no axe violations after making the checklist table keyboard accessible. The checklist also passed at 320px. The earlier source link check found all 65 local links in six static HTML pages resolved to existing paths.
- Earlier Duenara browser QA used updated source CSS against a prior self-contained offline HTML for app behavior, plus the static HTML/CSS files for content pages; that release passed a limited live smoke test. The later Duekrio host separately passed the six-page live checks summarized above. A full cross-browser regression remains a separate task for later releases.
- No slow server action applies to this browser-only version. CSV parsing and local storage are synchronous, so a skeleton screen is not needed without evidence of a noticeable delay. The import preview and copy-template action give visible feedback.

This design review does not cover the legal/security assessment. Orvaket is now live, and the user authorized free, zero-cash promotion. Recheck changed flows after each release and record new deployment evidence in [HOSTING.md](HOSTING.md).
