# nveil — reverse-proxy examples
#
# The base docker-compose.yml is proxy-agnostic: app + database only.
# HTTPS is REQUIRED (browsers disable the Web Crypto API on plain HTTP,
# which breaks all encryption). Pick ONE deployment below, or use your
# existing infrastructure.
#
# Every example assumes: .env exists with POSTGRES_PASSWORD set, and
#   docker network create proxy   (only for the shared-proxy examples)

> **⚠ Set POSTGRES_PASSWORD before the FIRST start.** The password is applied
> only when the `pgdata` volume is initialized — changing `.env` afterwards
> does nothing for a database that already exists. If you ever started with a
> weak password, the fix is a dump → fresh volume with the new password →
> restore (see RUNBOOK "Backups").

1-bundled-caddy/
    Standalone public server: nveil + its own Caddy with automatic
    Let's Encrypt certificates on ports 80/443. Nothing else needed.

2-shared-caddy/
    You already run Caddy for other apps (shared external "proxy" network).
    Adds the network attachment; your existing Caddyfile gets one block.

3-nginx/
    Same pattern for nginx: shared network + one server block with
    certbot certificates.

4-cloudflare-tunnel/
    No open ports at all: cloudflared connects the app to Cloudflare's
    edge, TLS terminates there. No Caddy/nginx required.

5-host-proxy/
    Proxy running OUTSIDE Docker (bare-metal nginx, corporate gateway):
    bind the app to loopback and proxy_pass to 127.0.0.1:3000.
