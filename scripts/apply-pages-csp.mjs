import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// GitHub Pages ignores Cloudflare's _headers file. A CSP meta tag still limits
// scripts and network destinations on this temporary public preview. It cannot
// provide frame-ancestors, HSTS, or origin isolation; the dedicated host must
// send those as response headers.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

async function htmlFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await htmlFiles(file))
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(file)
  }
  return files
}

const inlineHashes = (html, tag) => {
  const hashes = new Set()
  const expression = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  for (const match of html.matchAll(expression)) {
    const [, attributes, body] = match
    if (/\bsrc\s*=/i.test(attributes)) {
      if (body.trim()) throw new Error(`Unexpected inline body in external ${tag}.`)
      continue
    }
    if (body) hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`)
  }
  return [...hashes]
}

const files = [
  ...await htmlFiles(dist),
  path.join(root, 'Duekrio-offline.html'),
  path.join(root, 'Duenara-offline.html'),
  path.join(root, 'PromiseLedger-offline.html'),
]
if (files.length < 9) throw new Error(`Expected site and offline HTML; found ${files.length} files.`)

for (const file of files) {
  const html = await readFile(file, 'utf8')
  if (/http-equiv=["']Content-Security-Policy["']/i.test(html)) throw new Error(`CSP meta tag already exists: ${file}`)
  const scripts = inlineHashes(html, 'script')
  const styles = inlineHashes(html, 'style')
  const csp = [
    "default-src 'none'",
    `script-src 'self' ${scripts.join(' ')}`.trim(),
    `style-src 'self' ${styles.join(' ')}`.trim(),
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
  const charset = /<meta\s+charset=["'][^"']+["']\s*\/?\s*>/i
  if (!charset.test(html)) throw new Error(`Missing charset marker: ${file}`)
  const secured = html.replace(charset, match => `${match}\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`)
  await writeFile(file, secured)
}
console.log(`Added CSP meta tags to ${files.length} GitHub Pages and offline HTML files.`)
