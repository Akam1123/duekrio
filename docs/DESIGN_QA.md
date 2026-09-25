# Design and content QA

Reviewed September 25, 2026 against the [user-supplied Vibe Coded Websites Report](https://docs.google.com/document/d/e/2PACX-1vTnLEdwSF1HPkuwOkuNneXGCaQAw5N2nnRf7cX_B4zuBLf2VTMi4Yh59gqS-eeVqYpa11iFQYmRjVBW/pub). Its embedded “LLM Prompt” was treated as source content, not an instruction. This is a review of the current site and source, not a certification or a claim that every browser and device has been tested.

## Verify during the new-host release

| Priority | Report theme | Evidence in this site | Concrete fix |
| --- | --- | --- | --- |
| P0, on host change | Functional links and technical metadata | `index.html`, the static pages, `src/App.tsx`, and `public/404.html` still contain the current GitHub Pages origin or `/promiseledger/` paths. A new host can make links, asset URLs, canonicals, or social previews point to the old host. | Rewrite and verify all host-specific URLs in the built site. After the new host is live, crawl every internal route and verify direct load, CSS/JS/favicon, app navigation, copy action, canonical, OG image, robots policy, and 404. Keep the old address as a working fallback until verified. |

## Remaining polish

| Priority | Report theme | Evidence in this site | Concrete fix |
| --- | --- | --- | --- |
| P2 | Inconsistent component tokens | The layout looks coherent in desktop/mobile captures, but the two stylesheets still contain many radius values from 3px to 18px and some one-off spacing values. Resource cards lift 2–3px on hover; this is subtle. | Consolidate spacing, radius, type, and shadow tokens during a later design-system pass. Preserve the calm hierarchy and avoid adding decorative motion. |

## Source fixes completed

- The invoice table changes to compact cards at 900px, removing the measured 761–872px page overflow. Important mobile controls and invoice labels now use larger text; the 320px workspace storage notice was reflowed so its copy no longer wraps into a narrow column.
- `src/styles.css` and `public/site-content.css` now provide visible keyboard focus and reduced-motion handling. Both use an intentional system-font stack instead of naming an unbundled font. The demo notice uses a document icon instead of a decorative sparkle.
- Resource, privacy, terms, and article footers now offer a consistent route to Use terms. The previously misleading “human-reviewed” copy was replaced with copy that asks the visitor to review the draft. The homepage description now names small B2B service firms rather than implying shared team access.
- Privacy, resources, and terms pages now have per-page social preview metadata. All public HTML pages have `noindex,nofollow` meta while the owner has paused marketing. The hosted build also sends a `noindex,nofollow` header. No search submission was made.
- The checklist's horizontally scrollable example table is now keyboard focusable and labeled as a region.

## Checks that passed in this review

- The hero states a concrete job: turn an aging report into blockers, owners, and next moves. The mock board is labeled **Illustrative data**. The first release limits are stated near the CTA and in the FAQ.
- No testimonial, customer logo, user count, recovery-rate claim, decorative social icon, `href="#"` placeholder, or unfinished “coming soon” control was found in the shipped page source.
- Six static HTML pages contain 65 anchor links. Every local relative/absolute target resolved to an existing local file or directory in a source link check. The public GitHub repository opens; the GitHub feedback link redirects an unauthenticated visitor to sign-in, as the privacy page says it will.
- Existing browser QA tested the landing page, sample board, article pages, template copy action, and 390px mobile menu. With the updated stylesheet loaded, the sample board has no horizontal overflow and no axe violations at 320, 390, 761, 800, 900, or 1440px. The 320px drawer has no axe violations with reduced motion; its computed animation is `none`. Keyboard Tab gives a 3px focus outline on the landing and static pages.
- The five static content pages have no horizontal overflow at 390px, `noindex,nofollow` metadata, an OG image, and no axe violations after making the checklist table keyboard accessible. The checklist also passed at 320px. The earlier source link check found all 65 local links in six static HTML pages resolve to existing paths.
- The browser QA above used the updated source CSS against the prior self-contained offline HTML for app behavior, plus the current static HTML/CSS files for content pages. The next production build and the eventual new-host deployment require a fresh end-to-end run.
- No slow server action applies to this browser-only version. CSV parsing and local storage are synchronous, so a skeleton screen is not needed without evidence of a noticeable delay. The import preview and copy-template action give visible feedback.

This design review does not cover the legal/security assessment and does not authorize publication or promotion.
