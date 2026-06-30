# Deploy — crate-sdk.0xhoneyjar.xyz (AWS)

The docs site is hosted in **hosaka's AWS** (account 891376933289), not Vercel — even though
`0xhoneyjar.xyz` is otherwise wildcarded to Vercel. `crate-sdk.0xhoneyjar.xyz` is an **explicit
Route 53 override** of that wildcard.

## Live URL

https://crate-sdk.0xhoneyjar.xyz (CloudFront `d2yj9i2xm8iq8p.cloudfront.net`)

## Resources (us-east-1)

| Resource                                | Id                                      |
| --------------------------------------- | --------------------------------------- |
| S3 bucket (private, OAC)                | `crate-docs-0xhoneyjar-xyz`             |
| CloudFront distribution                 | `E13QRD6NNZ3UCF`                        |
| CloudFront function (dir-index rewrite) | `crate-docs-index-rewrite`              |
| Origin Access Control                   | `E2GZ3UHH9BQQ9E`                        |
| ACM cert (us-east-1)                    | for `crate-sdk.0xhoneyjar.xyz`          |
| Route 53 zone                           | `Z01393483Y40WF3N1H76` (0xhoneyjar.xyz) |

## DNS overrides (explicit, beat the `*.0xhoneyjar.xyz` Vercel wildcard)

- `crate-sdk.0xhoneyjar.xyz` A/AAAA alias → CloudFront
- `crate-sdk.0xhoneyjar.xyz` CAA → `amazon.com` (so ACM can issue; wildcard CAA is Vercel CAs)
- `_<token>.crate-sdk.0xhoneyjar.xyz` CNAME → ACM DNS validation

## Auto-deploy (CI)

`.github/workflows/docs-deploy.yml` deploys on **push to `main`** (paths: `site/**`,
`spec/openapi.json`, `docs/**`, `meta/**`) and on manual `workflow_dispatch`. Auth is **GitHub
OIDC** → role `crate-sdk-docs-github-deploy` (no long-lived keys). It builds, `aws s3 sync`s to the
bucket, and invalidates CloudFront.

**Font in CI:** a clean CI checkout has no trial woff2 (gitignored), so CI builds the
metric-similar **Helvetica-class fallback** (license-correct — trial fonts are not served
publicly). To serve real ABC Schengen, acquire the Dinamo webfont license, then add the two woff2
as base64 repo secrets (the workflow's "Provision font" step decodes them automatically):

```sh
gh secret set ABC_SCHENGEN_SANS_B64 < <(base64 -w0 ABCSchengenA-Variable.woff2)
gh secret set ABC_SCHENGEN_MONO_B64 < <(base64 -w0 ABCSchengenAMono-Variable.woff2)
```

## Manual redeploy (after `npm run build`)

```sh
cd site && npm run build
aws s3 sync dist s3://crate-docs-0xhoneyjar-xyz --delete
aws cloudfront create-invalidation --distribution-id E13QRD6NNZ3UCF --paths '/*'
```

## ⚠️ Pre-launch

ABC Schengen is the **trial** font here (gitignored). Acquire the Dinamo webfont license and drop
the licensed woff2 into `site/public/fonts/abc-schengen/` before treating this as public/launched.
