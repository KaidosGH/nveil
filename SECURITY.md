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
- Password-protected secrets never send the password; only a PBKDF2-wrapped
  content key envelope is stored.
- The threat model assumes TLS and exactly one trusted reverse proxy in front
  of the app (see deploy/).

Things that are **not** vulnerabilities in this model:

- Anyone holding the full secret link can read the secret — that is the design.
- For password-protected secrets, anyone holding the (UUID) link can fetch the
  wrapped envelope and attempt offline password guessing — password strength
  carries the security there.
- Metadata probes (`?meta=1`) reveal link validity/burn flags to link holders.

## Supported versions

Only the latest release is supported with security fixes.
