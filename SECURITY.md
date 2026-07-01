# Security Policy

## Reporting a vulnerability

**Do not open a public issue for security problems.** Report privately via GitHub Security
Advisories:

➡️ **[Report a vulnerability](https://github.com/hosaka-fm/crate-sdk/security/advisories/new)**

(GitHub → the repo → **Security** tab → **Report a vulnerability**.) We aim to acknowledge within
a few business days and will coordinate a fix and disclosure timeline with you.

Please include: affected version, a minimal reproduction, impact, and any suggested remediation.

## Supported versions

While the SDK is pre-`1.0`, security fixes target the **latest released minor**. Pin a version and
upgrade promptly when an advisory is published.

## Handling API keys

This SDK authenticates to crate with an API key (`X-API-Key`). Treat keys as secrets:

- **Never commit keys** or paste them into issues, PRs, logs, or screenshots. Use an environment
  variable (`CRATE_API_KEY`) or a secret manager.
- **Server-side only by default.** A browser bundle exposes the key — keep usage on the server,
  an edge function, or a backend proxy.
- **Rotate immediately** if a key is exposed, and scrub it from history.

## Scope

This policy covers the `@hosaka-fm/crate` **client library**. Vulnerabilities in the crate
**API/service** itself are governed by crate's Terms of Service — see
[crate support](https://crate.hosaka.fm/docs).
