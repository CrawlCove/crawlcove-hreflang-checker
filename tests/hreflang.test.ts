import { afterEach, describe, expect, it } from 'vitest'
import {
  analyseCluster,
  analyseSitemapEntries,
  checkPage,
  checkSitemap,
  DEFAULT_OPTIONS,
  extractCanonical,
  extractHreflangFromLinkHeader,
  extractHreflangTags,
  isNoindex,
  parseSitemapEntries,
  validateCode
} from '../src/hreflang.js'
import { FixtureServer } from './fixtureServer.js'

const codes = (r: { findings: Array<{ code: string }> }) => r.findings.map((x) => x.code).sort()

describe('validateCode (pure)', () => {
  it('accepts real codes in any case, x-default, scripts and numeric regions', () => {
    for (const c of ['en', 'EN-GB', 'fr-ca', 'zh-Hant-TW', 'es-419', 'x-default', 'X-Default', 'ast']) expect(validateCode(c).valid, c).toBe(true)
  })
  it('names the specific mistake', () => {
    expect(validateCode('en_US')).toMatchObject({ valid: false, note: expect.stringContaining('underscore') })
    expect(validateCode('en-uk')).toMatchObject({ valid: false, note: expect.stringContaining('"gb"') })
    expect(validateCode('english')).toMatchObject({ valid: false, note: expect.stringContaining('language name') })
    expect(validateCode('zz')).toMatchObject({ valid: false })
    expect(validateCode('gb')).toMatchObject({ valid: false, note: expect.stringContaining('en-gb') })
    expect(validateCode('en-eu')).toMatchObject({ valid: false })
    expect(validateCode('')).toMatchObject({ valid: false })
  })
  it('keeps bare "uk" valid (Ukrainian) but warns', () => {
    expect(validateCode('uk')).toMatchObject({ valid: true, note: expect.stringContaining('Ukrainian') })
  })
})

describe('extractors (pure)', () => {
  it('reads link tags from the head only, resolves relative hrefs and flags them', () => {
    const html = `<html><head><link rel="alternate" hreflang="en" href="https://a.test/en/"><LINK REL='alternate' HREFLANG='fr' HREF='/fr/'><link rel="stylesheet alternate" hreflang="de" href="https://a.test/de/"></head><body><link rel="alternate" hreflang="es" href="https://a.test/es/"></body></html>`
    const tags = extractHreflangTags('https://a.test/en/', html)
    expect(tags.map((t) => [t.hreflang, t.href, t.absolute])).toEqual([
      ['en', 'https://a.test/en/', true],
      ['fr', 'https://a.test/fr/', false],
      ['de', 'https://a.test/de/', true]
    ])
  })
  it('reads the HTTP Link header', () => {
    const tags = extractHreflangFromLinkHeader('<https://a.test/en/>; rel="alternate"; hreflang="en", </fr/>; rel=alternate; hreflang=fr, <https://a.test/x.css>; rel="stylesheet"', 'https://a.test/')
    expect(tags.map((t) => [t.hreflang, t.href, t.source])).toEqual([
      ['en', 'https://a.test/en/', 'header'],
      ['fr', 'https://a.test/fr/', 'header']
    ])
  })
  it('finds canonical and noindex', () => {
    expect(extractCanonical('https://a.test/en/', '<head><link rel="canonical" href="/en/"></head>')).toBe('https://a.test/en/')
    expect(isNoindex(null, '<head><meta name="robots" content="index, follow"></head>')).toBe(false)
    expect(isNoindex(null, '<head><meta name="googlebot" content="noindex"></head>')).toBe(true)
    expect(isNoindex('noindex, nofollow', '')).toBe(true)
  })
})

describe('analyseCluster (pure)', () => {
  it('detects self-reference, x-default and a code declared for two URLs', () => {
    const tags = extractHreflangTags('https://a.test/en/', `<head>
      <link rel="alternate" hreflang="en" href="https://a.test/en/">
      <link rel="alternate" hreflang="fr" href="https://a.test/fr/">
      <link rel="alternate" hreflang="fr" href="https://a.test/fr-old/">
      <link rel="alternate" hreflang="x-default" href="https://a.test/">
    </head>`)
    const a = analyseCluster('https://a.test/en/#top', tags)
    expect(a).toMatchObject({ selfReferencing: true, hasXDefault: true, duplicates: ['fr'] })
  })
})

describe('sitemap mode (pure)', () => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url><loc>https://a.test/en/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://a.test/en/"/>
    <xhtml:link rel="alternate" hreflang="de" href="https://a.test/de/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://a.test/en/"/>
  </url>
  <url><loc>https://a.test/de/</loc>
    <xhtml:link rel="alternate" hreflang="de" href="https://a.test/de/"/>
    <xhtml:link rel="alternate" hreflang="fr" href="https://a.test/fr/"/>
  </url>
  <url><loc>https://a.test/plain/</loc></url>
</urlset>`
  it('parses xhtml:link entries and cross-references return tags without fetching', () => {
    const p = parseSitemapEntries(sitemap)
    expect(p.kind).toBe('urlset')
    expect(p.entries.map((e) => [e.loc, e.tags.length])).toEqual([['https://a.test/en/', 3], ['https://a.test/de/', 2], ['https://a.test/plain/', 0]])
    const a = analyseSitemapEntries(p.entries)
    expect(a.entries.map((e) => e.loc)).toEqual(['https://a.test/en/', 'https://a.test/de/'])
    // en → de: de's entry does not list en back. de → fr: fr is not in the sitemap.
    expect(a.entries[0].reciprocity).toEqual([{ href: 'https://a.test/de/', hreflang: 'de', status: 'missing', note: expect.any(String) }])
    expect(a.entries[1].reciprocity).toEqual([{ href: 'https://a.test/fr/', hreflang: 'fr', status: 'not-in-sitemap' }])
    expect(codes(a)).toEqual(['missing-return-tag', 'missing-x-default', 'not-in-sitemap'])
  })
  it('recognises a sitemap index and rejects non-sitemap XML', () => {
    expect(parseSitemapEntries('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://a.test/s1.xml</loc></sitemap></sitemapindex>')).toMatchObject({ kind: 'sitemapindex', children: ['https://a.test/s1.xml'] })
    expect(parseSitemapEntries('<rss><channel/></rss>').kind).toBe('unknown')
    expect(parseSitemapEntries('<not xml').kind).toBe('unknown')
  })
})

describe('over HTTP', () => {
  let server: FixtureServer
  afterEach(async () => server.close())
  const opts = { ...DEFAULT_OPTIONS, timeoutMs: 3000 }

  const page = (self: string, others: Array<[string, string]>, extraHead = '') =>
    `<html><head>${extraHead}${[['self', self], ...others].map(([code, href]) => `<link rel="alternate" hreflang="${code === 'self' ? 'xx' : code}" href="${href}">`).join('')}</head><body>hi</body></html>`

  it('passes a healthy reciprocal cluster', async () => {
    server = new FixtureServer({})
    const base = await server.listen()
    const en = `${base}/en/`
    const fr = `${base}/fr/`
    const head = (me: string, mine: string) =>
      `<html><head><link rel="alternate" hreflang="${mine}" href="${me}"><link rel="alternate" hreflang="${mine === 'en' ? 'fr' : 'en'}" href="${mine === 'en' ? fr : en}"><link rel="alternate" hreflang="x-default" href="${en}"></head></html>`
    server.set({ '/en/': { body: head(en, 'en') }, '/fr/': { body: head(fr, 'fr') } })
    const r = await checkPage(en, opts)
    expect(r.findings).toEqual([])
    expect(r).toMatchObject({ selfReferencing: true, hasXDefault: true, checked: 1, totalAlternates: 1 })
    expect(r.reciprocity).toEqual([{ href: fr, hreflang: 'fr', status: 'ok' }])
  })

  it('flags a missing return tag, an unreachable alternate, a redirecting alternate, noindex and a canonical conflict', async () => {
    server = new FixtureServer({})
    const base = await server.listen()
    const en = `${base}/en/`
    server.set({
      '/en/': {
        headers: { 'x-robots-tag': 'noindex' },
        body: `<html><head><link rel="canonical" href="${base}/en-canonical/"><link rel="alternate" hreflang="en" href="${en}"><link rel="alternate" hreflang="de" href="${base}/de/"><link rel="alternate" hreflang="es" href="${base}/es/"><link rel="alternate" hreflang="it" href="${base}/it/"></head></html>`
      },
      '/de/': { body: `<html><head><link rel="alternate" hreflang="de" href="${base}/de/"></head></html>` },
      '/it/': { status: 301, headers: { location: `${base}/it-new/` }, body: '' }
    })
    const r = await checkPage(en, opts)
    expect(r.reciprocity.map((x) => [x.hreflang, x.status])).toEqual([['de', 'missing'], ['es', 'unreachable'], ['it', 'redirected']])
    expect(codes(r)).toEqual(['alternate-redirects', 'alternate-unreachable', 'canonical-conflict', 'missing-return-tag', 'missing-x-default', 'noindex'])
    expect(r.canonical).toBe(`${base}/en-canonical/`)
  })

  it('reads the Link header, merges it with HTML, and follows the page’s own redirect', async () => {
    server = new FixtureServer({})
    const base = await server.listen()
    server.set({
      '/old': { status: 302, headers: { location: `${base}/en/` }, body: '' },
      '/en/': {
        headers: { link: `<${base}/en/>; rel="alternate"; hreflang="en", <${base}/x-default/>; rel="alternate"; hreflang="x-default"` },
        body: `<html><head><link rel="alternate" hreflang="en" href="${base}/en/"></head></html>`
      },
      '/x-default/': { body: `<html><head><link rel="alternate" hreflang="en" href="${base}/en/"></head></html>` }
    })
    const r = await checkPage(`${base}/old`, opts)
    expect(r.finalUrl).toBe(`${base}/en/`)
    expect(r.tags.map((t) => [t.hreflang, t.source])).toEqual([['en', 'html'], ['x-default', 'header']])
    expect(codes(r)).toEqual(['page-redirects'])
  })

  it('reports no-hreflang and fetch-error honestly', async () => {
    server = new FixtureServer({ '/': { body: '<html><head><title>x</title></head></html>' } })
    const base = await server.listen()
    expect(codes(await checkPage(`${base}/`, opts))).toEqual(['no-hreflang'])
    const missing = await checkPage(`${base}/nope`, opts)
    expect(missing.status).toBe(404)
    expect(codes(missing)).toEqual(['fetch-error'])
    expect(codes(await checkPage('http://127.0.0.1:9/', { ...opts, timeoutMs: 500 }))).toEqual(['fetch-error'])
  })

  it('caps the return-tag check at --max-alternates and says so', async () => {
    server = new FixtureServer({})
    const base = await server.listen()
    const routes: Record<string, { body: string }> = {}
    const langs = ['de', 'fr', 'es']
    const tagsFor = (self: string) => `<html><head><link rel="alternate" hreflang="en" href="${base}/en/">${langs.map((l) => `<link rel="alternate" hreflang="${l}" href="${base}/${l}/">`).join('')}<link rel="alternate" hreflang="x-default" href="${base}/en/">${self}</head></html>`
    routes['/en/'] = { body: tagsFor('') }
    for (const l of langs) routes[`/${l}/`] = { body: tagsFor('') }
    server.set(routes)
    const r = await checkPage(`${base}/en/`, { ...opts, maxAlternates: 2 })
    expect(r).toMatchObject({ totalAlternates: 3, checked: 2, truncated: true })
    expect(codes(r)).toEqual(['alternates-truncated'])
  })

  it('checks a sitemap index end to end, tolerating one dead child', async () => {
    server = new FixtureServer({})
    const base = await server.listen()
    const child = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
      <url><loc>${base}/en/</loc><xhtml:link rel="alternate" hreflang="en" href="${base}/en/"/><xhtml:link rel="alternate" hreflang="de" href="${base}/de/"/><xhtml:link rel="alternate" hreflang="x-default" href="${base}/en/"/></url>
      <url><loc>${base}/de/</loc><xhtml:link rel="alternate" hreflang="de" href="${base}/de/"/><xhtml:link rel="alternate" hreflang="en" href="${base}/en/"/><xhtml:link rel="alternate" hreflang="x-default" href="${base}/en/"/></url>
    </urlset>`
    server.set({
      '/sitemap.xml': { headers: { 'content-type': 'application/xml' }, body: `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${base}/s1.xml</loc></sitemap><sitemap><loc>${base}/dead.xml</loc></sitemap></sitemapindex>` },
      '/s1.xml': { headers: { 'content-type': 'application/xml' }, body: child }
    })
    const r = await checkSitemap(`${base}/sitemap.xml`, opts)
    expect(r).toMatchObject({ totalInSitemap: 2, checked: 2, truncated: false })
    expect(r.entries.every((e) => e.reciprocity.every((x) => x.status === 'ok'))).toBe(true)
    expect(codes(r)).toEqual(['child-unreachable'])
  })

  it('rejects a sitemap with no hreflang at all', async () => {
    server = new FixtureServer({ '/s.xml': { body: '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://a.test/</loc></url></urlset>' } })
    const base = await server.listen()
    expect(codes(await checkSitemap(`${base}/s.xml`, opts))).toEqual(['no-hreflang'])
  })
})
