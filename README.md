# nveil

Self-hosted, zero-knowledge ephemeral secrets sharing. Share passwords, API keys and notes via links that encrypt in your browser and die on schedule.

The server only ever stores **ciphertext**: it never sees the plaintext content, the decryption key, or the URL fragment that carries it. No tracking, no analytics, no third-party requests, no persistent access logs — the only cookie is a functional one storing your language choice.

Source: [github.com/KaidosGH/nveil](https://github.com/KaidosGH/nveil)

## Features

- **End-to-end encrypted** — AES-256-GCM entirely in the browser (Web Crypto API, no third-party crypto libraries)
- **Burn after reading** — the first read with the correct key atomically consumes the secret server-side; concurrent or later readers get nothing, and a confirmation step prevents accidental consumption
- **Expiring secrets** — 5 minutes to 30 days, auto-deleted
- **Key separation mode** — share the link and the decryption key through different channels
- **Password protection** — an optional password wraps the decryption key (PBKDF2-SHA256, 600k iterations + AES-GCM); the link alone is not enough, and the password never leaves the creator's browser
- **QR codes** — share the secret or management link optically; the QR encodes exactly the URL shown on screen
- **Management links** — delete a secret before it expires, without revealing it
- **Abuse reporting** — public report dialog and a key-protected operator queue
- **Bilingual UI** (English / German, toggle in the footer)
- **Legal pages** — fill-in templates for privacy notice, imprint, cookies and terms; the footer links only the pages you actually provide (see "Legal pages" below)
- **Zero tracking** — no analytics, no third-party requests; the only cookie stores the language choice (`nveil-lang`); dark UI with a performance-effects toggle

## How it works

1. **Create** — the browser generates a random AES-256-GCM key, encrypts your text, and uploads only ciphertext plus metadata. You get:
   - a **secret link** (`/secret/{id}#{key}`) — the key lives in the URL fragment, which browsers never send to the server;
   - a **management link** (`/manage/{id}#{creator-token}`) — also fragment-based, so the token never appears in proxy access logs. Lets you delete the secret before it expires. Save it; it cannot be recovered.
2. **View** — the recipient's browser validates the key against a stored SHA-256 checksum, decrypts locally, and scrubs the key from the address bar. With burn-after-read on (default), a confirmation step asks before the **first read with the correct key atomically consumes the secret server-side** — concurrent or later readers get nothing, and wrong keys are rejected without consuming it.
3. **Expire** — expired secrets are deleted automatically: on access, and by the container healthcheck (every 30s) — the cleanup itself is throttled to once per minute, so secrets are gone within about 90 seconds of expiring, even with zero traffic.

Advanced mode can separate the key from the link: the recipient opens `/secret/{id}` and pastes the key received through a different channel. Alternatively, the key can be wrapped with a password (key delivery "Password"): the link is then keyless and the recipient must enter the password — a wrong password fails locally (the secret is never consumed by failed attempts) before the real key is ever presented to the server.

## Getting started (development)

Requires Node.js 22.18+ (type stripping must be default; CI runs 24, the Docker image ships 26) and a PostgreSQL database.

```bash
cp .env.example .env        # set DATABASE_URL to your local Postgres
npm install
npm run db:push             # or let the Docker image apply the schema
npm run dev
```

## Deployment (Docker)

```bash
cp .env.example .env        # set POSTGRES_PASSWORD (required)
docker compose up -d --build
```

The base compose file is proxy-agnostic — just app + database, no ports
published to the host, no TLS bundled. That is deliberate: **HTTPS is
mandatory** (browsers disable the Web Crypto API on plain HTTP, which breaks
all encryption), and how you terminate TLS depends on what already runs on
your server. **nveil officially supports running behind exactly one
TLS-terminating reverse proxy** (all `deploy/` examples provide one): the
rate limiter derives client IPs from proxy-set headers, so serving the app
directly without a proxy is not supported — client-supplied
`X-Forwarded-For` values would defeat the per-IP limits. Ready-made
deployment examples live in [`deploy/`](deploy/):

| Directory | For |
| --- | --- |
| `deploy/1-bundled-caddy/` | Standalone public server — nveil brings its own Caddy, automatic Let's Encrypt on 80/443 |
| `deploy/2-shared-caddy/` | You already run Caddy for other apps (shared Docker network + one Caddyfile block) |
| `deploy/3-nginx/` | nginx as TLS terminator (certbot certificates) |
| `deploy/4-cloudflare-tunnel/` | No open ports — cloudflared connects the app to Cloudflare's edge |
| `deploy/5-host-proxy/` | Proxy outside Docker (bare-metal nginx/Caddy, corporate gateway) — app binds loopback only |

Each is a `docker-compose.yml` override applied with
`docker compose -f docker-compose.yml -f deploy/<example>/compose.override.yml up -d`,
plus the proxy config snippet where one is needed. Set the database password
**before the first start** — it initializes the data volume, and later changes
to it do not apply to an existing volume. The database schema is applied
automatically at container start.

## Configuration

All configuration lives in `.env` (gitignored; see `.env.example` for the full
list with comments). The variables split into two groups: the first three are read by
`docker-compose.yml` (compose refuses to start without `POSTGRES_PASSWORD`);
the rest configure the app itself (compose also passes the whole `.env`
through to the app container).

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | *(required, no default)* | Database password — applies on **first** volume initialization only |
| `PORT` | `3000` | App port (container + host mapping + healthcheck all follow it) |
| `DATABASE_URL` | compose sets it | Only needed when running the app **outside** Docker |
| `NVEIL_PUBLIC` | `false` | Shows the legal links in the footer — but only for documents that exist in `content/` (see "Legal pages" below); the footer itself — source link, language and effects toggles — is always visible |
| `NVEIL_DEFAULT_LANGUAGE` | `en` | UI language until the visitor toggles (`en` / `de`) |
| `NVEIL_CONTACT_EMAIL` | — | General contact; used in `security.txt` |
| `NVEIL_REPORT_ABUSE` | `false` | Enables the abuse dialog and the operator queue |
| `NVEIL_REPORT_ABUSE_KEY` | — | Operator key for the queue (≥ 32 chars; required when abuse reporting is on) |
| `NVEIL_ABUSE_EMAIL` | — | Optional dedicated abuse contact in `security.txt` |
| `NVEIL_SUPPORT_URL` | — | Optional "Support this project" footer link (shown only when set) |
| `NVEIL_MANAGED_URL` | — | Optional "Managed instance" footer CTA (shown only when set) |
| `RATE_LIMIT_CREATE_PER_HOUR` | `30` | Secret creation limit per client IP |
| `NVEIL_CLOUDFLARE_RANGES_URL` | built-in list | Refresh source for the Cloudflare edge IPs used to validate `CF-Connecting-IP` |
| `RATE_LIMIT_VIEW_PER_MINUTE` | `120` | View limit per client IP |
| `RATE_LIMIT_DELETE_PER_MINUTE` | `60` | Delete limit per client IP |

### Legal pages (privacy notice, imprint, cookies, terms)

No legal text ships with the software: the documents describe your identity
and your processing, which the software cannot know. Instead, four
**fill-in templates** live in `content.example/` — each a skeleton of
required *fields* with comments marking which jurisdictions expect which
section (EU: §5 DDG imprint, GDPR Art. 13 notice; US: CalOPPA and the
state privacy laws; DSA terms for public instances). Replace every
bracketed field, delete the sections that don't apply to you, and drop the
files into the gitignored `content/` directory:

```
content/privacy.html               # or privacy.txt   — expected on essentially every public instance
content/imprint.html               # or imprint.txt   — EU operators (§5 DDG); footer label: "Impressum"
content/cookies_and_tracking.html  # optional standalone cookie disclosure — GDPR prefers it inside the privacy notice
content/tos.html                   # optional terms of service — DSA Art. 14 for public instances, US convention
```

Only the pages whose files exist are served — the footer links appear per
page, and only when `NVEIL_PUBLIC` is set (a missing file is never a
broken link; a public instance with no legal pages at all logs a startup
warning). Create `content/` next to `docker-compose.yml` (compose mounts
it into the container automatically), fill in the files, done — dropping
a file in makes the link appear without a restart.

## API

| Method | Route | Description |
| --- | --- | --- |
| POST | `/api/secrets` | Create (`{ ciphertext, iv, keyChecksum, creatorTokenHash, burnAfterRead, expiresAt }`, plus the password envelope when `hasPassword`) → `{ id }`, 201 |
| GET | `/api/secrets/{id}` | Fetch payload + metadata. Payload reads require the `x-key-checksum` header matching the stored key hash (403 otherwise) and consume burn-after-read secrets. A valid `x-creator-token` header instead returns manage metadata only (the payload is deliberately unreachable without the key). `?meta=1` keyless returns status flags (burn, password) and, for password-protected secrets, the wrapped key envelope. |
| DELETE | `/api/secrets/{id}` | Delete — always requires a valid `x-creator-token` header |
| POST | `/api/abuse-reports` | Report abuse (`{ url, reason? }`; an `x-key-checksum` header marks the report witness-verified) — enabled via `NVEIL_REPORT_ABUSE`; answers a uniform 202 |
| GET | `/api/abuse-reports/list` | Operator queue (`x-abuse-key` header; `?includeResolved` also returns closed reports) |
| POST | `/api/abuse-reports/{id}/resolve` | Close a report without touching the secret (operator) |
| POST | `/api/abuse-reports/{id}/delete-secret` | Delete the reported secret and close the report (operator) |
| GET | `/.well-known/security.txt` | RFC 9116 security contact (from `NVEIL_CONTACT_EMAIL` / `NVEIL_ABUSE_EMAIL`) |
| GET | `/api/health` | Health check incl. database |

Rate limits apply per client IP (configurable via the `RATE_LIMIT_*` variables
above) → `429` with `Retry-After`. Limits count whole teams behind one
NAT/VPN IP, so tune them to your deployment size.

## Operations

Day-to-day operation of a public instance — abuse-report triage, backups and
restore tests, database size checks, common failures, TLS certificate
renewal (including the Cloudflare-proxied case), and updates — is covered in
the [operations runbook](RUNBOOK.md). The short version: monitor
`/api/health`, back up the database nightly (`pg_dump`), keep backups ≤ 31
days, and check the abuse queue when reports arrive.

## Security notes

- All crypto is `crypto.subtle` (AES-256-GCM, 96-bit IV); keys and creator tokens are 256-bit random.
- Creator tokens are stored as SHA-256 hashes and compared with `timingSafeEqual`.
- Strict CSP with nonces, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, HSTS; secrets render as plain text by default; optional markdown rendering goes through `rehype-sanitize` with a structural allowlist (raw HTML is never executed).
- Request bodies are capped at 300 KB for the JSON endpoints — enforced while reading the body, independent of `Content-Length`, so chunked transfer cannot bypass the cap. The reverse-proxy examples additionally cap bodies at 1 MB as defense in depth; the Cloudflare Tunnel example cannot (cloudflared has no body-size option), which is acceptable because the app-side cap holds everywhere.
- Password-protected secrets: the server only stores/serves the PBKDF2-wrapped key envelope, so offline guessing is bounded by 600k-iteration PBKDF2 — the password's strength carries the security.
- Rate limiting is in-memory: fine for a single instance; multi-replica deployments should move it to Redis.
- Never log plaintext or keys. Plaintext exists only in the browser's memory of the two parties.
- Abuse reports store only the secret ID, an optional reason and timestamps — never reporter IPs, fragments or secret contents. Reports are only visible to holders of `NVEIL_REPORT_ABUSE_KEY`.

## AI-assisted development

This project was created with heavy AI assistance (an AI coding agent). All
resulting code was reviewed, tested and iterated on by the human maintainer:
the repository ships with a cryptographic self-check and an end-to-end test
suite, and the security posture was manually reviewed (OWASP Top 10 checklist,
dependency audits). That said, treat it as you would any young,
single-maintainer project — review the code yourself before deploying it
publicly.

## Development

```bash
npm run dev      # dev server (relaxed CSP for hot reload)
npm run build    # production build
npm run check    # self-checks: crypto round trip, IP spoof protection, body cap, markdown sanitizer, legal loader, schema drift
```

The full e2e suite (`npm run test:e2e` → `tests/e2e.mjs`) and the browser UI
regression suite (`npm run test:ui` → `tests/ui-regression.mjs`) each run
against a production server (`npm run build && npm start`) with a Postgres
database — the same checks the bundled CI workflow executes. A few focused
Playwright checks from past fix-PRs live beside them
(`tests/qr-visual-check.mjs`, `tests/qr-stale-state-check.mjs`,
`tests/secret-width-check.mjs`) — they stub the API and need a server but no
database; run each with `node tests/<name>.mjs` (see its header for the
`BASE_URL` convention).

## Contributing

Activate the secret-scanning pre-commit hook once per clone (it blocks commits
containing secrets; missing binaries degrade to a warning):

```bash
git config core.hooksPath .githooks
```

Run `npm run check` and the e2e suite (`tests/e2e.mjs` with a local Postgres)
before pushing; UI changes also need `npm run test:ui` (browser-based).

## Credits

The animated background is the [Ribbon Field](https://threeui.com/backgrounds/predictive-arc/ribbon-field)
effect from [ThreeUI](https://github.com/MengTo/threeui) (MIT License),
adapted for this project. The vendored files in
`components/effects/ribbon-field/` carry the upstream MIT notice.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
