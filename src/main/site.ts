import { lookup as dnsLookup } from 'dns/promises'
import { isIP } from 'net'

const MAX_BYTES = 3 * 1024 * 1024
const MAX_TEXT = 15000
const MIN_TEXT = 200
const MAX_REDIRECTS = 5
const TIMEOUT_MS = 15000

export type SiteResult = { ok: true; url: string; text: string } | { ok: false; error: SiteError }
export type SiteError = 'SITE_INVALID_URL' | 'SITE_BLOCKED' | 'SITE_UNREACHABLE' | 'SITE_NOT_HTML' | 'SITE_NO_TEXT'

export interface SiteDeps {
  fetch: typeof fetch
  lookup: (host: string) => Promise<{ address: string }[]>
}

const defaultDeps: SiteDeps = {
  fetch: (...args) => fetch(...args),
  lookup: (host) => dnsLookup(host, { all: true })
}

export function normalizeUrl(input: string): URL | null {
  const raw = input.trim()
  if (!raw) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    if (url.port && url.port !== '80' && url.port !== '443') return null
    return url
  } catch {
    return null
  }
}

function ipv4ToInt(ip: string) {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0)
}

function isBlockedIpv4(ip: string) {
  const n = ipv4ToInt(ip)
  const inRange = (base: string, bits: number) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(ipv4ToInt(base) / 2 ** (32 - bits))
  return (
    inRange('0.0.0.0', 8) ||
    inRange('10.0.0.0', 8) ||
    inRange('100.64.0.0', 10) ||
    inRange('127.0.0.0', 8) ||
    inRange('169.254.0.0', 16) ||
    inRange('172.16.0.0', 12) ||
    inRange('192.168.0.0', 16) ||
    n >= ipv4ToInt('224.0.0.0')
  )
}

// Local and private addresses must stay out of reach: a pasted link or a redirect could point at a router or a local service.
export function isBlockedAddress(address: string) {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
  const kind = isIP(ip)
  if (kind === 4) return isBlockedIpv4(ip)
  if (kind !== 6) return true
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isBlockedIpv4(mapped[1])
  if (ip.startsWith('::ffff:')) return true
  return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith('ff')
}

async function isBlockedHost(url: URL, deps: SiteDeps) {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return isBlockedAddress(host)
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.')) return true
  const addresses = await deps.lookup(host)
  return addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? m
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
  })
}

function metaContent(html: string, name: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (new RegExp(`(?:name|property)\\s*=\\s*["']${name}["']`, 'i').test(tag)) {
      const content = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
      if (content) return content[1] ?? content[2]
    }
  }
  return ''
}

export function extractText(html: string) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
  const description = metaContent(html, 'description') || metaContent(html, 'og:description')
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const lines = [title, description, body]
    .join('\n')
    .split('\n')
    .map((l) => decodeEntities(l).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return [...new Set(lines)].join('\n').slice(0, MAX_TEXT)
}

async function readLimited(res: Response) {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  await reader.cancel().catch(() => {})
  const out = new Uint8Array(Math.min(size, MAX_BYTES))
  let offset = 0
  for (const c of chunks) {
    const part = c.subarray(0, out.length - offset)
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function decode(bytes: Uint8Array, contentType: string) {
  // Older Israeli and European sites may use legacy encodings such as windows-1255.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048))
  const charset = contentType.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

export async function fetchSiteText(input: string, deps: SiteDeps = defaultDeps): Promise<SiteResult> {
  const start = normalizeUrl(input)
  if (!start) return { ok: false, error: 'SITE_INVALID_URL' }
  let url: URL = start
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (await isBlockedHost(url, deps)) return { ok: false, error: 'SITE_BLOCKED' }
      const res: Response = await deps.fetch(url.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'text/html,text/plain;q=0.9', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SMMApp/0.1' }
      })
      if (res.status >= 300 && res.status < 400) {
        const location: string | null = res.headers.get('location')
        const next: URL | null = location ? normalizeUrl(new URL(location, url).href) : null
        await res.body?.cancel().catch(() => {})
        if (!next) return { ok: false, error: 'SITE_BLOCKED' }
        url = next
        continue
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {})
        return { ok: false, error: 'SITE_UNREACHABLE' }
      }
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType && !/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
        await res.body?.cancel().catch(() => {})
        return { ok: false, error: 'SITE_NOT_HTML' }
      }
      const text = extractText(decode(await readLimited(res), contentType))
      // JavaScript-rendered sites come back almost empty; the UI then asks the user to paste the text.
      if (text.length < MIN_TEXT) return { ok: false, error: 'SITE_NO_TEXT' }
      return { ok: true, url: url.href, text }
    }
    return { ok: false, error: 'SITE_UNREACHABLE' }
  } catch {
    return { ok: false, error: 'SITE_UNREACHABLE' }
  }
}
