import { describe, expect, it } from 'vitest'
import { remainingLegacyProjectUrls, rewriteLegacyHtmlUrls, rewriteLegacyProjectUrl } from './hosted-urls.mjs'

const target = 'https://qa-duekrio.pages.dev/'

describe('dedicated-host URL migration', () => {
  it('rewrites only the exact legacy origin and project path', () => {
    expect(rewriteLegacyProjectUrl('https://akam1123.github.io/promiseledger/privacy/?v=1#details', target))
      .toBe('https://qa-duekrio.pages.dev/privacy/?v=1#details')
    expect(rewriteLegacyProjectUrl('https://akam1123.github.io/promiseledger', target))
      .toBe(target)
    expect(rewriteLegacyProjectUrl('https://akam1123.github.io.evil.example/promiseledger/', target))
      .toBe('https://akam1123.github.io.evil.example/promiseledger/')
    expect(rewriteLegacyProjectUrl('https://akam1123.github.io@evil.example/promiseledger/', target))
      .toBe('https://akam1123.github.io@evil.example/promiseledger/')
    expect(rewriteLegacyProjectUrl('https://akam1123.github.io/promiseledger-evil/', target))
      .toBe('https://akam1123.github.io/promiseledger-evil/')
  })

  it('rewrites canonical and link attributes while detecting only real legacy URLs left behind', () => {
    const html = '<link href="https://akam1123.github.io/promiseledger/privacy/">' +
      '<meta content="https://akam1123.github.io/promiseledger/og-card.png">' +
      '<a href="https://akam1123.github.io.evil.example/promiseledger/">Outside</a>'
    const rewritten = rewriteLegacyHtmlUrls(html, target)
    expect(rewritten).toContain('href="https://qa-duekrio.pages.dev/privacy/"')
    expect(rewritten).toContain('content="https://qa-duekrio.pages.dev/og-card.png"')
    expect(rewritten).toContain('href="https://akam1123.github.io.evil.example/promiseledger/"')
    expect(remainingLegacyProjectUrls(rewritten)).toEqual([])
    expect(remainingLegacyProjectUrls('https://akam1123.github.io/promiseledger/')).toEqual(['https://akam1123.github.io/promiseledger/'])
  })
})
