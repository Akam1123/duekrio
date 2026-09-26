import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { remainingLegacyProjectUrls, rewriteLegacyHtmlUrls } from './hosted-urls.mjs'

// The source targets the Orvaket root. This build also supports compatibility
// deployments on the older Duekrio and Duenara Cloudflare origins.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(projectRoot, 'dist-hosted')
const suppliedOrigin = process.env.PUBLIC_ORIGIN
if (!suppliedOrigin) throw new Error('Set PUBLIC_ORIGIN to the exact HTTPS root URL claimed for this deployment (for example https://your-project.pages.dev/).')
const url = new URL(suppliedOrigin)
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.origin === 'https://example.com') {
  throw new Error('PUBLIC_ORIGIN must be a real HTTPS origin with a trailing / and no path, query, or credentials.')
}
const publicOrigin = `${url.origin}/`
const sourceOrigin = 'https://orvaket.pages.dev/'
const isPrimaryPublicSite = publicOrigin === sourceOrigin
const searchablePages = new Map([
  ['index.html', ''],
  ['privacy/index.html', 'privacy/'],
  ['terms/index.html', 'terms/'],
  ['resources/index.html', 'resources/'],
  ['resources/weekly-ar-review-checklist/index.html', 'resources/weekly-ar-review-checklist/'],
  ['resources/overdue-invoice-email-templates/index.html', 'resources/overdue-invoice-email-templates/'],
])
const noindexMeta = /\s*<meta name="robots" content="noindex,nofollow"\s*\/?>/g

const assertOne = (source, pattern, label, replacement) => {
  const matches = source.match(pattern)
  if (matches?.length !== 1) throw new Error(`Expected one ${label}; found ${matches?.length ?? 0}.`)
  return source.replace(pattern, replacement)
}

async function htmlFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await htmlFiles(fullPath))
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath)
  }
  return files
}

const privacyNew = '<p>This website is served by Cloudflare Pages. Cloudflare may process request information, such as an IP address, to deliver and protect the site; see its <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">privacy policy</a>. The public source code is available on <a href="https://github.com/Akam1123/orvaket" target="_blank" rel="noreferrer">GitHub</a>. The application has no server that receives imported invoices or notes.</p>'
const oldCloudflareMigrationNote = '<div class="note" id="legacy-host-warning"><strong>Moving to the new address.</strong><p>This is an older Cloudflare address. Browser storage saved here stays on this origin and does not appear at <a href="https://orvaket.pages.dev/" target="_blank" rel="noopener noreferrer">orvaket.pages.dev</a> automatically. Open this workspace, unlock it if necessary, and download a JSON backup through <strong>Backup options</strong>. Then open the <a href="https://orvaket.pages.dev/#/app" target="_blank" rel="noopener noreferrer">new workspace</a>, choose <strong>Restore backup</strong>, and verify the invoices before clearing the old copy. Keep any backup passphrase separately; Orvaket cannot recover it.</p></div>'

const files = await htmlFiles(distRoot)
if (files.length < 6) throw new Error(`Hosted build is unexpectedly incomplete (${files.length} HTML files).`)
for (const file of files) {
  let html = await readFile(file, 'utf8')
  const relativePath = path.relative(distRoot, file).replaceAll('\\', '/')
  if (relativePath === 'index.html') {
    html = assertOne(html, /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, 'JSON-LD block', '')
    html = assertOne(html, /\s*<script>\s*if \(window\.location\.protocol === 'file:'\)[\s\S]*?<\/script>/g, 'offline redirect script', '')
    html = assertOne(html, /\s*<style>[\s\S]*?<\/style>/g, 'offline-only inline style', '')
    html = assertOne(html, /<div id="root">[\s\S]*?<\/div>/g, 'offline-only root content', '<div id="root"></div>')
  }
  if (relativePath === 'privacy/index.html') {
    if (!html.includes(privacyNew)) throw new Error('Expected Cloudflare Pages host disclosure on privacy page.')
    const migrationNote = /\s*<div class="note" id="legacy-host-warning">[\s\S]*?<\/div>/g
    if (['duenara.pages.dev', 'duekrio.pages.dev'].includes(url.hostname)) {
      html = assertOne(html, migrationNote, 'legacy-host warning', oldCloudflareMigrationNote)
    } else if (html.match(migrationNote)?.length !== 1) {
      throw new Error('Expected one migration note on privacy page.')
    }
  }
  // Source HTML stays noindex for the old GitHub Pages address. Only the
  // primary Cloudflare host may expose the reviewed free routes to search.
  if (isPrimaryPublicSite && searchablePages.has(relativePath)) {
    html = assertOne(html, noindexMeta, `robots hold on ${relativePath}`, '')
  } else if (!noindexMeta.test(html)) {
    throw new Error(`Expected noindex on ${relativePath} for this host.`)
  }
  noindexMeta.lastIndex = 0
  const headEnd = html.indexOf('</head>')
  if (headEnd < 0) throw new Error(`Missing head in ${file}`)
  const head = rewriteLegacyHtmlUrls(html.slice(0, headEnd), publicOrigin).replaceAll(sourceOrigin, publicOrigin)
  if (isPrimaryPublicSite && searchablePages.has(relativePath)) {
    const canonical = new URL(searchablePages.get(relativePath), publicOrigin).href
    if (!head.includes(`<link rel="canonical" href="${canonical}"`)) throw new Error(`Unexpected canonical on ${relativePath}.`)
  }
  html = (head + html.slice(headEnd)).replace(/(["'])\/promiseledger\//g, '$1/')
  // The privacy migration note intentionally links to the old GitHub origin so
  // visitors can export existing browser data before switching hosts.
  const withoutMigrationNote = html.replace(/<div class="note" id="legacy-host-warning">[\s\S]*?<\/div>/g, '')
  if (remainingLegacyProjectUrls(withoutMigrationNote).length > 0 || /(["'])\/promiseledger\//.test(html)) throw new Error(`Old deployment path remains in ${file}`)
  if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html) || /<style\b/i.test(html) || /\son[a-z]+\s*=/i.test(html)) {
    throw new Error(`Inline executable content remains in ${file}; the strict CSP would block it.`)
  }
  await writeFile(file, html)
}

const csp = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
  "font-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'",
  "form-action 'none'", "frame-ancestors 'none'", "frame-src 'none'", "worker-src 'none'",
  'upgrade-insecure-requests',
].join('; ')
const searchHeaders = isPrimaryPublicSite
  ? '\n/resources/invoice-exception-kit/*\n  X-Robots-Tag: noindex, nofollow\n\n/404.html\n  X-Robots-Tag: noindex, nofollow\n'
  : '  X-Robots-Tag: noindex, nofollow\n'
await writeFile(path.join(distRoot, '_headers'), `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n  Strict-Transport-Security: max-age=31536000\n${searchHeaders}\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`)
if (isPrimaryPublicSite) {
  // The old resource routes remain crawlable so their noindex can be observed,
  // but are not linked from the free resources hub or included in the sitemap.
  const entries = [...searchablePages.values()].map(route => `  <url><loc>${new URL(route, publicOrigin).href}</loc></url>`).join('\n')
  await Promise.all([
    writeFile(path.join(distRoot, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${publicOrigin}sitemap.xml\n`),
    writeFile(path.join(distRoot, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`),
  ])
}
console.log(`Prepared ${files.length} hosted HTML pages for ${publicOrigin}`)
