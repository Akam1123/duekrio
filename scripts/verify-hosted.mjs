import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist-hosted')
const publicOrigin = process.env.PUBLIC_ORIGIN
if (!publicOrigin) throw new Error('Set PUBLIC_ORIGIN before verifying the hosted build.')
const isPrimaryPublicSite = publicOrigin === 'https://orvaket.pages.dev/'
const freeRoutes = [
  '', 'privacy/', 'terms/', 'resources/',
  'resources/weekly-ar-review-checklist/',
  'resources/overdue-invoice-email-templates/',
]
const read = relative => readFile(path.join(root, relative), 'utf8')
const assert = (ok, message) => { if (!ok) throw new Error(message) }
const hasNoindex = html => /<meta name="robots" content="noindex,nofollow"\s*\/?>/.test(html)

for (const route of freeRoutes) {
  const file = route ? `${route}index.html` : 'index.html'
  const html = await read(file)
  assert(html.includes(`<link rel="canonical" href="${new URL(route, publicOrigin).href}"`), `Wrong canonical: ${file}`)
  assert(hasNoindex(html) !== isPrimaryPublicSite, `Wrong robots meta: ${file}`)
}
for (const file of ['404.html', 'resources/invoice-exception-kit/index.html', 'resources/invoice-exception-kit/license/index.html']) {
  assert(hasNoindex(await read(file)), `Missing noindex on ${file}`)
}
const resources = await read('resources/index.html')
assert(!resources.includes('invoice-exception-kit/'), 'The free resources hub still links to the old offer.')
const privacy = await read('privacy/index.html')
if (['https://duekrio.pages.dev/', 'https://duenara.pages.dev/'].includes(publicOrigin)) {
  assert(privacy.includes('This is an older Cloudflare address.'), 'Legacy privacy page lacks migration guidance.')
  assert(privacy.includes('https://orvaket.pages.dev/#/app'), 'Legacy privacy page lacks the new workspace link.')
} else if (isPrimaryPublicSite) {
  assert(privacy.includes('https://duekrio.pages.dev/#/app'), 'Primary privacy page lacks the Duekrio export route.')
}
const headers = await read('_headers')
assert(headers.includes("Content-Security-Policy: default-src 'none'"), 'Strict CSP is missing.')
const firstRule = headers.split('\n\n')[0]
assert(firstRule.includes('X-Robots-Tag: noindex, nofollow') !== isPrimaryPublicSite, 'Wrong site-wide robots header.')
if (isPrimaryPublicSite) {
  assert(headers.includes('/resources/invoice-exception-kit/*\n  X-Robots-Tag: noindex, nofollow'), 'Old resource routes need noindex headers.')
  const robots = await read('robots.txt')
  const sitemap = await read('sitemap.xml')
  assert(robots.includes(`Sitemap: ${publicOrigin}sitemap.xml`), 'Wrong robots.txt sitemap URL.')
  for (const route of freeRoutes) {
    const loc = `<loc>${new URL(route, publicOrigin).href}</loc>`
    assert(sitemap.includes(loc), `Missing sitemap URL: ${route}`)
  }
  assert((sitemap.match(/<loc>/g) ?? []).length === freeRoutes.length, 'Sitemap has unexpected URLs.')
  assert(!sitemap.includes('invoice-exception-kit'), 'Old resource route appears in sitemap.')
} else {
  for (const file of ['robots.txt', 'sitemap.xml']) {
    try { await read(file); throw new Error(`Unexpected ${file} on a non-primary host.`) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}
console.log(`Verified hosted search policy for ${publicOrigin}`)
