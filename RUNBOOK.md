# Operations Runbook (nveil)

Short, concrete procedures for the day-to-day operation of a public nveil
instance. Assumes the docker-compose deployment from the repository root.

---

## 1. Daily operation

| Task | How |
| --- | --- |
| Is the service up? | `curl https://your-domain/api/health` → `{"status":"ok","db":"up"}`. Put an external uptime monitor on this endpoint. |
| Container status | `docker compose ps` — app and db should show `(healthy)` (healthchecks configured in `docker-compose.yml`). |
| Logs | `docker compose logs app --tail 100` — the app intentionally logs almost nothing (privacy); expect startup lines only. |
| Restart | `docker compose restart app` — in-memory rate-limit buckets reset (limits re-apply immediately). |

## 2. Abuse report handling

1. A report arrives either via the **in-app "Report abuse" dialog** (lands in the queue) or by email to your abuse/contact address (typical for external parties).
2. Open the operator queue: `https://your-domain/abuse-reports` → enter `NVEIL_REPORT_ABUSE_KEY` (session-stored in the browser).
3. **You cannot verify content — and that is by design.** The server stores ciphertext only and reports never carry the key; the reporter is the witness, you decide. Use the **witness badge** to judge how much the reporter knew:

   | Badge | Meaning | Trust level |
   | --- | --- | --- |
   | **witness-verified** | Filed from below a decrypted secret; the reporter's key checksum matched (they demonstrably held the key) | High — a first-hand attestation |
   | **unverified** | Filed from the footer; the reporter may only hold an ID they never opened | Lower — could be a false report aimed at deleting someone's secret |

   Triage matrix:
   - **witness-verified + specific reason** → delete. Acting on a witnessed attestation.
   - **unverified + specific reason** (describes the content precisely) → likely seen via the link; still credible, lean delete.
   - **unverified + vague reason** → skeptical; dismissing is legitimate. Secrets self-expire (≤ 31 days, usually far less), so "do nothing" is a real option.
   - **anything describing clearly illegal content** → delete regardless of badge; the badge informs triage, never blocks action.
   - **live** status → the secret still exists; **gone / dismissed** → already expired/deleted, close with **Dismiss**.
4. **Bulk**: "Delete all N live secrets" behind the confirm button — use for coordinated abuse campaigns.
5. Anonymous in-app reports are informal notices — they do not identify a reporter, so they are not formally "duly substantiated" notices under the DSA (no contact channel). Fine for this handling model; document this boundary if you operate a large public instance.
6. Deleting via the queue is the primary tool. As a last resort (queue unreachable), delete directly:
   ```bash
   docker compose exec db psql -U nveil -d nveil -c "DELETE FROM secrets WHERE id = '<id from reporter>';"
   docker compose exec db psql -U nveil -d nveil -c "DELETE FROM abuse_reports WHERE secret_id = '<id>';"
   ```
   Note: you never need the creator token or the encryption key for this — the row deletion makes the ciphertext unreachable and it is unreadable anyway.

## 3. Backups

```bash
# Backup (cron nightly, keep <= 31 days — matches the app's data retention):
docker compose exec db pg_dump -U nveil nveil > backup-$(date +%F).sql

# Restore test (do this once before going live, and after major upgrades):
docker compose exec -T db psql -U nveil nveil < backup-<date>.sql
```

Backups contain only ciphertext, hashes and metadata — no plaintext, no keys, no IPs. Retain them no longer than 31 days so the published data-retention promise stays true.

## 4. Database size

```bash
docker compose exec db psql -U nveil -d nveil \
  -c "SELECT pg_size_pretty(pg_database_size('nveil'));"
docker compose exec db psql -U nveil -d nveil \
  -c "SELECT count(*), pg_size_pretty(sum(length(ciphertext))::bigint) FROM secrets;"
```

Growth beyond a few MB means abuse (each secret is ≤ 100 KB, everything expires within 31 days). Expired rows are purged automatically: on every access to the secrets API and by the container healthcheck, throttled to once per minute — so nothing lingers, even on an instance with no visitors.

## 5. TLS certificates and Cloudflare

**Normal operation (grey cloud / DNS-only, or no Cloudflare):** Caddy's default
HTTP-01 challenge renews certificates automatically. Nothing to do.

**When the DNS record is proxied (orange cloud) with SSL mode "Full (strict)":
certificate renewal changes.** The ACME server's HTTP-01 validation now
reaches *Cloudflare's edge* instead of your origin. It usually still works,
but it is fragile (depends on edge redirect behavior and "Always Use HTTPS"
rules) — the reliable configuration is the **DNS-01 challenge via the
Cloudflare API**, which needs no inbound ACME traffic at all:

1. Create a Cloudflare API token with `Zone → DNS → Edit` on your zone.
2. Use a Caddy build that includes the Cloudflare DNS module (the stock
   `caddy:2-alpine` image does **not** have it):
   ```dockerfile
   FROM caddy:2-alpine AS base
   FROM xcaddybuild AS builder
   # or: build with xcaddy locally:
   #   xcaddy build --with github.com/caddy-dns/cloudflare
   ```
   Simplest: a small Dockerfile that runs
   `xcaddy build --with github.com/caddy-dns/cloudflare` on the `golang` image
   and copies the binary into `caddy:2-alpine`.
3. Caddyfile for the nveil site:
   ```caddy
   secrets.example.com {
           reverse_proxy nveil-app:3000
           tls {
                   dns cloudflare {env.CF_DNS_API_TOKEN}
           }
   }
   ```
4. Pass `CF_DNS_API_TOKEN` to the Caddy container (env / secrets). Renewals
   now happen entirely through DNS — immune to proxy and firewall behavior.

**Also when switching to proxied:** nveil's rate limiter automatically prefers
`CF-Connecting-IP` once the peer is a verified Cloudflare edge (validated
against CF's published IP ranges — see `lib/rate-limit.ts`). No app change
needed. Verify after flipping:
```bash
docker compose logs app --tail 50    # app healthy
curl https://your-domain/api/health  # {"status":"ok","db":"up"}
```

**Monitor certificate expiry** regardless of mode (external uptime checkers
warn ~30 days out):
```bash
echo | openssl s_client -connect your-domain:443 2>/dev/null | openssl x509 -noout -enddate
```

## 6. Common failures

| Symptom | Cause / fix |
| --- | --- |
| `/api/health` → `{"status":"degraded","db":"down"}` | Postgres unreachable. `docker compose ps` (db healthy?), `docker compose logs db`. The app retries per request — no restart needed once the DB is back. |
| Container restart loops | `docker compose logs app` — usually a bad `.env` value. Fix and `docker compose up -d`. |
| Changed `POSTGRES_PASSWORD` in compose, login still fails | Credentials only apply on **first** volume initialization. Fix: `docker compose down -v` (⚠ deletes all data), then `up -d`. |
| Reports of Outlook/Teams links not working | SafeLinks strips the `#key` fragment — recipient needs a freshly copied link or separate-key mode. Working as intended. |
| Users report the site is slow / laggy | Point them at the **Effects: off** footer toggle (disables the WebGL background). Server-side, check `docker stats` for CPU. |
| Certificate renewal failing after enabling Cloudflare proxy (orange cloud) | See section 5 — switch the Caddyfile to the DNS-01 challenge. |

## 7. Updates

```bash
git pull
docker compose up -d --build     # rebuilds the image, restarts with zero data loss
docker compose exec db pg_dump -U nveil nveil > pre-update-backup.sql   # before, not after
```

Watch the Next.js release notes and re-run `npm audit` between deployments
(Dependabot handles the schedule).
