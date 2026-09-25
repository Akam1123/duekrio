const legacyBase = new URL('https://akam1123.github.io/promiseledger/')

function legacyProjectUrl(candidate) {
  let url
  try { url = new URL(candidate) } catch { return null }
  if (url.origin !== legacyBase.origin) return null
  if (url.pathname !== '/promiseledger' && !url.pathname.startsWith(legacyBase.pathname)) return null
  return url
}

export function rewriteLegacyProjectUrl(candidate, publicOrigin) {
  const original = legacyProjectUrl(candidate)
  if (!original) return candidate
  const suffix = original.pathname === '/promiseledger' ? '' : original.pathname.slice(legacyBase.pathname.length)
  const replacement = new URL(suffix, publicOrigin)
  replacement.search = original.search
  replacement.hash = original.hash
  return replacement.href
}

export function rewriteLegacyHtmlUrls(html, publicOrigin) {
  return html.replace(/(\b(?:href|src|content)=)(["'])(https?:\/\/[^"']+)\2/gi,
    (match, attribute, quote, candidate) => `${attribute}${quote}${rewriteLegacyProjectUrl(candidate, publicOrigin)}${quote}`)
}

export function remainingLegacyProjectUrls(html) {
  return [...html.matchAll(/https?:\/\/[^\s"'<>]+/gi)]
    .map(match => match[0])
    .filter(candidate => legacyProjectUrl(candidate) !== null)
}
