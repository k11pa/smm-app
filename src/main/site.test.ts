import { describe, expect, it, vi } from 'vitest'
import { SiteDeps, extractText, fetchSiteText, isBlockedAddress, normalizeUrl } from './site'

const PAGE = `<html><head><title>Cafe Roma</title><meta name="description" content="Coffee &amp; cake"><style>.x{}</style></head>
<body><script>alert('nope')</script><h1>Welcome</h1><p>${'We roast our own beans. '.repeat(20)}</p></body></html>`

function deps(routes: Record<string, Response | (() => Response)>, addresses: Record<string, string> = {}): SiteDeps {
  return {
    fetch: vi.fn(async (url: any) => {
      const r = routes[String(url)]
      if (!r) throw new Error('network error')
      return typeof r === 'function' ? r() : r
    }) as any,
    lookup: async (host) => [{ address: addresses[host] ?? '93.184.216.34' }]
  }
}

const html = (body: string, type = 'text/html; charset=utf-8') => new Response(body, { headers: { 'content-type': type } })

describe('normalizeUrl', () => {
  it('adds https to a bare domain', () => {
    expect(normalizeUrl('cafe.co.il')?.href).toBe('https://cafe.co.il/')
  })

  it.each(['file:///c:/windows/win.ini', 'ftp://cafe.co.il', 'javascript:alert(1)', 'http://user:pw@cafe.co.il', 'http://cafe.co.il:8080', ''])('rejects %s', (url) => {
    expect(normalizeUrl(url)).toBeNull()
  })
})

describe('isBlockedAddress', () => {
  it.each(['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'garbage'])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true)
  })

  it.each(['93.184.216.34', '172.32.0.1', '2606:2800:220:1::1'])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false)
  })
})

describe('extractText', () => {
  it('keeps title, description and visible text, and drops scripts and styles', () => {
    const text = extractText(PAGE)
    expect(text).toContain('Cafe Roma')
    expect(text).toContain('Coffee & cake')
    expect(text).toContain('We roast our own beans.')
    expect(text).not.toContain('alert')
    expect(text).not.toContain('.x{}')
  })

  it('caps the length to limit AI cost', () => {
    expect(extractText(`<p>${'word '.repeat(10000)}</p>`).length).toBeLessThanOrEqual(15000)
  })
})

describe('fetchSiteText', () => {
  it('reads a normal page', async () => {
    const r = await fetchSiteText('cafe.example', deps({ 'https://cafe.example/': html(PAGE) }))
    expect(r).toMatchObject({ ok: true, url: 'https://cafe.example/' })
  })

  it('decodes a legacy Hebrew encoding', async () => {
    const hebrew = new Uint8Array([0xf9, 0xec, 0xe5, 0xed]) // shalom in windows-1255
    const padded = new Uint8Array([...new TextEncoder().encode('<p>'), ...hebrew, ...new TextEncoder().encode(`</p><p>${'x '.repeat(150)}</p>`)])
    const r = await fetchSiteText('cafe.example', deps({ 'https://cafe.example/': new Response(padded, { headers: { 'content-type': 'text/html; charset=windows-1255' } }) }))
    expect(r.ok && r.text).toContain('שלום')
  })

  it('blocks a host that resolves to a private address, without fetching', async () => {
    const d = deps({}, { 'router.example': '192.168.1.1' })
    expect(await fetchSiteText('router.example', d)).toEqual({ ok: false, error: 'SITE_BLOCKED' })
    expect(d.fetch).not.toHaveBeenCalled()
  })

  it.each(['localhost', 'http://127.0.0.1', 'http://[::1]', 'intranet'])('blocks %s', async (url) => {
    expect(await fetchSiteText(url, deps({}))).toEqual({ ok: false, error: 'SITE_BLOCKED' })
  })

  it('checks every redirect target', async () => {
    const redirect = new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })
    expect(await fetchSiteText('cafe.example', deps({ 'https://cafe.example/': redirect }))).toEqual({ ok: false, error: 'SITE_BLOCKED' })
  })

  it('stops an endless redirect loop', async () => {
    const loop = () => new Response(null, { status: 302, headers: { location: 'https://cafe.example/' } })
    expect(await fetchSiteText('cafe.example', deps({ 'https://cafe.example/': loop }))).toEqual({ ok: false, error: 'SITE_UNREACHABLE' })
  })

  it('reports non-pages, empty JavaScript pages and network errors distinctly', async () => {
    expect(await fetchSiteText('a.example', deps({ 'https://a.example/': html('%PDF', 'application/pdf') }))).toEqual({ ok: false, error: 'SITE_NOT_HTML' })
    expect(await fetchSiteText('a.example', deps({ 'https://a.example/': html('<div id="root"></div><script src="a.js"></script>') }))).toEqual({ ok: false, error: 'SITE_NO_TEXT' })
    expect(await fetchSiteText('a.example', deps({}))).toEqual({ ok: false, error: 'SITE_UNREACHABLE' })
    expect(await fetchSiteText('a.example', deps({ 'https://a.example/': new Response('gone', { status: 404 }) }))).toEqual({ ok: false, error: 'SITE_UNREACHABLE' })
  })
})
