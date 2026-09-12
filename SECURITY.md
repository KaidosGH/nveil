# Security Policy

## Reporting a vulnerability

Please report vulnerabilities through **GitHub's private vulnerability
reporting** (Security tab → "Report a vulnerability"). Do not open a public
issue for anything you believe is exploitable.

You will get a response within a few days. If a report is accepted, fixes are
released as a patch and credited unless you prefer otherwise.

## Scope and design assumptions

nveil is a zero-knowledge secret-sharing service. Knowing the design helps you
write a useful report:

- The server stores only AES-256-GCM ciphertext. Encryption/decryption happens
  in the browser; the decryption key lives in the URL fragment and is never
  sent to the server.
- Burn-after-read consumption is a single atomic server-side delete.
- View-limit expiry (`maxViews`): the final allowed read is the same atomic
  server-side delete. Only a read counter and a first-view timestamp are
  stored — no per-view log, and never who viewed or from where.
- Optional access-key gate (managed instances): creation requires a 256-bit
  access key; only its SHA-256 hash, a label and lifecycle timestamps are
  stored. Secrets are never linked to keys, and the key is held in an
  httpOnly cookie (never readable by scripts).
- Management key (`NVEIL_MANAGEMENT_KEY`, >= 32 chars): unlocks `/management`,
  the access-key admin API and the runtime instance settings. The browser
  exchanges it once for an httpOnly `nveil-management` session cookie (gone on
  logout or browser close); API clients may instead send the `x-management-key`
  header. Unlock and API calls are rate-limited per IP. It is a bearer
  credential: anyone who learns it can administer the instance, so treat it
  like the deployment password.
- Password-protected secrets never send the password; only a PBKDF2-wrapped
  content key envelope is stored.
- The threat model assumes TLS and exactly one trusted reverse proxy in front
  of the app (see deploy/).

Things that are **not** vulnerabilities in this model:

- Anyone holding the full secret link can read the secret — that is the design.
- For password-protected secrets, anyone holding the (UUID) link can fetch the
  wrapped envelope and attempt offline password guessing — password strength
  carries the security there.
- Metadata probes (`?meta=1`) reveal link validity, burn and password flags
  and — for password-protected secrets — the PBKDF2-wrapped key envelope
  (which is what enables the offline-guessing case above).

## Supported versions

Only the latest release is supported with security fixes.
