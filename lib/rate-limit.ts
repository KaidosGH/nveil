/**
 * Fixed-window in-memory rate limiter.
 *
 * ponytail: state lives in this process only — works for a single instance
 * (the MVP deployment) but NOT behind multiple replicas. Multi-instance
 * deployments should swap this for a Redis-backed limiter.
 */

type Bucket = { count: number; windowStart: number; windowMs: number };

const buckets = new Map<string, Bucket>();

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Limits are per IP — which behind corporate NAT/VPN means "per team", so the
 * defaults sit well above legitimate shared-IP usage. Tune via env vars for
 * your deployment size (see .env.example).
 */
export const RATE_LIMITS = {
  createPerHour: envLimit('RATE_LIMIT_CREATE_PER_HOUR', 30),
  viewPerMinute: envLimit('RATE_LIMIT_VIEW_PER_MINUTE', 120),
  deletePerMinute: envLimit('RATE_LIMIT_DELETE_PER_MINUTE', 60),
  abuseReportsPerHour: envLimit('RATE_LIMIT_ABUSE_REPORTS_PER_HOUR', 10),
  abuseAdminPerMinute: envLimit('RATE_LIMIT_ABUSE_ADMIN_PER_MINUTE', 30),
} as const;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();

  // ponytail: O(n) sweep on a size cap, fine for the scale a single instance serves.
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (now - b.windowStart > b.windowMs) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now, windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((bucket.windowStart + windowMs - now) / 1000),
    };
  }
  bucket.count++;
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * Cloudflare's published edge IP ranges (www.cloudflare.com/ips-v4 + ips-v6).
 * Refreshed from there when NVEIL_CLOUDFLARE_RANGES_URL is set at startup;
 * these constants are the fallback so the check works offline.
 * ponytail: hardcoding is fine — CF ranges change rarely; the env var exists
 * for operators who want to pin/refresh without a code change.
 */
const CF_FALLBACK_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

/** Cached parsed ranges; loaded once per process at first use. */
let cfRanges: { lo: bigint; hi: bigint }[] | null = null;
let cfRangesLoading: Promise<void> | null = null;

function ipv4ToLoHi(ip: string): { lo: bigint; hi: bigint } | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const base = parts.reduce((acc, p) => acc * 256n + BigInt(Number(p) || 0), 0n);
  return { lo: base, hi: base };
}

/** Groups a (possibly compressed) IPv6 address into its 8 hex groups. */
function ipv6Groups(ip: string): number[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const tail = halves[1] !== undefined && halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const fill = 8 - head.length - tail.length;
  if (fill < 0 || (halves.length === 2 && fill === 0)) return null;
  const all = [...head, ...Array(fill).fill('0'), ...tail];
  const groups = all.map((g) => parseInt(g || '0', 16));
  return groups.some((n) => !Number.isInteger(n) || Number.isNaN(n)) ? null : groups;
}

/** Packs the 8 hex groups into one 128-bit bigint. */
function groupsToBigInt(groups: number[]): bigint {
  return groups.reduce((acc, g) => (acc << 16n) + BigInt(g), 0n);
}

function parseCidr(cidr: string): { lo: bigint; hi: bigint } | null {
  const [ip, bitsStr] = cidr.split('/');
  if (ip.includes(':')) {
    const groups = ipv6Groups(ip);
    const bits = Number(bitsStr);
    if (!groups || !Number.isInteger(bits) || bits < 0 || bits > 128) return null;
    const size = 1n << BigInt(128 - bits);
    const base = groupsToBigInt(groups);
    return { lo: (base / size) * size, hi: (base / size) * size + size - 1n };
  }
  const net = ipv4ToLoHi(ip);
  const bits = Number(bitsStr);
  if (!net || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const size = 1n << BigInt(32 - bits);
  return { lo: (net.lo / size) * size, hi: (net.lo / size) * size + size - 1n };
}

function ipInCidr4(ip: string, cidr: { lo: bigint; hi: bigint }): boolean {
  const net = ipv4ToLoHi(ip);
  if (!net) return false;
  return net.lo >= cidr.lo && net.lo <= cidr.hi;
}

function ipInCidr6(ip: string, cidr: { lo: bigint; hi: bigint }): boolean {
  const groups = ipv6Groups(ip);
  if (!groups) return false;
  const value = groupsToBigInt(groups);
  return value >= cidr.lo && value <= cidr.hi;
}

/**
 * True when the direct peer (as seen by our trusted proxy) is a Cloudflare
 * edge — i.e. the connection actually transited Cloudflare, so
 * CF-Connecting-IP can be trusted. Direct hits that merely SET the header
 * fail this check and the header is ignored (spoof protection).
 */
function isCloudflarePeer(peerIp: string, ranges: { lo: bigint; hi: bigint }[]): boolean {
  const isV6 = peerIp.includes(':');
  return ranges.some((r) => (isV6 ? ipInCidr6(peerIp, r) : ipInCidr4(peerIp, r)));
}

async function loadCfRanges(): Promise<{ lo: bigint; hi: bigint }[]> {
  const url = process.env.NVEIL_CLOUDFLARE_RANGES_URL;
  if (url) {
    try {
      const text = await (await fetch(url)).text();
      const parsed = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map(parseCidr)
        .filter((r): r is { lo: bigint; hi: bigint } => r !== null);
      if (parsed.length > 0) return parsed;
    } catch {
      /* fall back to the built-in list */
    }
  }
  return CF_FALLBACK_RANGES.map(parseCidr).filter((r) => r !== null);
}

function ensureCfRanges(): Promise<{ lo: bigint; hi: bigint }[]> {
  if (cfRanges) return Promise.resolve(cfRanges);
  cfRangesLoading ??= loadCfRanges().then((ranges) => {
    cfRanges = ranges;
  });
  return cfRangesLoading.then(() => cfRanges!);
}

/**
 * Client IP for rate limiting, assuming EXACTLY ONE trusted proxy in front
 * (the documented deployment: Caddy). Proxies APPEND the connecting IP to any
 * client-supplied X-Forwarded-For, so the last XFF entry is the one the proxy
 * vouched for — keying on the first entry would let attackers rotate forged
 * values and get a fresh bucket per request.
 *
 * When the peer is a Cloudflare edge IP (Cloudflare proxied/orange-cloud in
 * front of the proxy), CF-Connecting-IP carries the real client IP and is
 * preferred; the header is ignored for everyone else so it cannot be spoofed
 * by direct hits. Callers await this because the CF ranges load once per
 * process (built-in fallback list; refreshable via NVEIL_CLOUDFLARE_RANGES_URL).
 */
export async function clientIp(headers: Headers): Promise<string> {
  const forwarded = headers.get('x-forwarded-for');
  const peerIp = forwarded ? forwarded.split(',').pop()!.trim() : (headers.get('x-real-ip') ?? '');

  const cfConnecting = headers.get('cf-connecting-ip');
  if (cfConnecting && peerIp) {
    const ranges = await ensureCfRanges();
    if (isCloudflarePeer(peerIp, ranges)) return cfConnecting;
  }

  return peerIp || 'unknown';
}
