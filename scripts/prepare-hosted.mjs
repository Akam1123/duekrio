import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { remainingLegacyProjectUrls, rewriteLegacyHtmlUrls } from './hosted-urls.mjs'

// The GitHub Pages demo uses a project path. A dedicated static host serves
// the same app from /, with its own origin and browser-storage boundary.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(projectRoot, 'dist-hosted')
const suppliedOrigin = process.env.PUBLIC_ORIGIN
if (!suppliedOrigin) throw new Error('Set PUBLIC_ORIGIN to the exact HTTPS root URL claimed for this deployment (for example https://your-project.pages.dev/).')
const url = new URL(suppliedOrigin)
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.origin === 'https://example.com') {
  throw new Error('PUBLIC_ORIGIN must be a real HTTPS origin with a trailing / and no path, query, or credentials.')
}
const publicOrigin = `${url.origin}/`

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

const privacyNew = '<p>This website is served by Cloudflare Pages. Cloudflare may process request information, such as an IP address, to deliver and protect the site; see its <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">privacy policy</a>. The public source code is available on <a href="https://github.com/Akam1123/promiseledger" target="_blank" rel="noreferrer">GitHub</a>. The application has no server that receives imported invoices or notes.</p>'

const files = await htmlFiles(distRoot)
if (files.length < 6) throw new Error(`Hosted build is unexpectedly incomplete (${files.length} HTML files).`)
for (const file of files) {
  let html = await readFile(file, 'utf8')
  if (path.relative(distRoot, file) === 'index.html') {
    html = assertOne(html, /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, 'JSON-LD block', '')
    html = assertOne(html, /\s*<script>\s*if \(window\.location\.protocol === 'file:'\)[\s\S]*?<\/script>/g, 'offline redirect script', '')
    html = assertOne(html, /\s*<style>[\s\S]*?<\/style>/g, 'offline-only inline style', '')
    html = assertOne(html, /<div id="root">[\s\S]*?<\/div>/g, 'offline-only root content', '<div id="root"></div>')
  }
  if (path.relative(distRoot, file).replaceAll('\\', '/') === 'privacy/index.html') {
    html = assertOne(html, /<p>The website is currently served by GitHub Pages\.[\s\S]*?<\/p>/g, 'host disclosure', privacyNew)
    html = assertOne(html, /\s*<div class="note" id="legacy-host-warning">[\s\S]*?<\/div>/g, 'legacy-host warning', '')
  }
  html = rewriteLegacyHtmlUrls(html, publicOrigin).replace(/(["'])\/promiseledger\//g, '$1/')
  if (remainingLegacyProjectUrls(html).length > 0 || /(["'])\/promiseledger\//.test(html)) throw new Error(`Old deployment path remains in ${file}`)
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
await writeFile(path.join(distRoot, '_headers'), `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n  Strict-Transport-Security: max-age=31536000\n  X-Robots-Tag: noindex, nofollow\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`)
console.log(`Prepared ${files.length} hosted HTML pages for ${publicOrigin}`)
