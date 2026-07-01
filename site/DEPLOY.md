# Deploy — crate-sdk.hosaka.fm (AWS)

The docs site is hosted in **hosaka's AWS** (account 891376933289). Primary domain is
**`crate-sdk.hosaka.fm`** (in the Terraform-managed `hosaka.fm` Route 53 zone). The old
**`crate-sdk.0xhoneyjar.xyz`** is kept as a **transitional alias** on the same CloudFront
distribution (multi-SAN cert) until crate's landing flips its inbound link — then it can be retired.

## Live URL

https://crate-sdk.hosaka.fm (CloudFront `d2yj9i2xm8iq8p.cloudfront.net`) · legacy alias:
https://crate-sdk.0xhoneyjar.xyz

## Resources (us-east-1)

| Resource                                | Id                                                          |
| --------------------------------------- | ---------------------------------------------------------- |
| S3 bucket (private, OAC)                | `crate-docs-0xhoneyjar-xyz` ⚠️ internal name — **carve-out**, not renamed (bucket rename = migrate + repoint; like `honeyjar-terraform-state`) |
| CloudFront distribution                 | `E13QRD6NNZ3UCF` (aliases: crate-sdk.hosaka.fm + crate-sdk.0xhoneyjar.xyz) |
| CloudFront function (dir-index rewrite) | `crate-docs-index-rewrite`                                 |
| Origin Access Control                   | `E2GZ3UHH9BQQ9E`                                           |
| ACM cert (us-east-1, multi-SAN)         | crate-sdk.hosaka.fm + crate-sdk.0xhoneyjar.xyz            |
| Route 53 zones                          | `Z06075752AIVGWUY9CS2A` (hosaka.fm, primary) · `Z01393483Y40WF3N1H76` (0xhoneyjar.xyz, legacy alias) |

## DNS

- **hosaka.fm zone** (`Z06075752AIVGWUY9CS2A`): `crate-sdk.hosaka.fm` A/AAAA alias → CloudFront.
  The zone's CAA already authorizes AWS ACM (no override needed).
- **0xhoneyjar.xyz zone** (`Z01393483Y40WF3N1H76`, legacy): `crate-sdk.0xhoneyjar.xyz` A/AAAA alias
  → CloudFront, plus a `CAA amazon.com` override (that zone is otherwise Vercel-wildcarded). Retire
  once crate stops linking to the old host.

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

## Resource tags

All resources are tagged `Project=crate-sdk`, `Owner=sdk-team`, `Component=docs-site|docs-deploy`,
`Lifecycle=active` for cost allocation + discovery (S3 bucket, CloudFront distribution, IAM role,
ACM cert).

## Teardown

```sh
# 1. Delete the CloudFront distribution (disable → wait → delete; ~15 min)
aws cloudfront get-distribution-config --id E13QRD6NNZ3UCF      # note the ETag + set Enabled:false → update-distribution
aws cloudfront delete-distribution --id E13QRD6NNZ3UCF --if-match <etag>
aws cloudfront delete-function --name crate-docs-index-rewrite --if-match <etag>
# 2. Empty + delete the bucket
aws s3 rm s3://crate-docs-0xhoneyjar-xyz --recursive && aws s3api delete-bucket --bucket crate-docs-0xhoneyjar-xyz
# 3. Remove DNS + cert + IAM (Route53 zone Z01393483Y40WF3N1H76)
#    delete the crate-sdk.0xhoneyjar.xyz A/AAAA alias + CAA + the _<token> validation CNAME
aws acm delete-certificate --region us-east-1 --certificate-arn arn:aws:acm:us-east-1:891376933289:certificate/c5cb4aa9-64cc-46e1-95fb-a3f47aeaaadb
aws iam delete-role-policy --role-name crate-sdk-docs-github-deploy --policy-name docs-deploy-s3-cloudfront
aws iam delete-role --role-name crate-sdk-docs-github-deploy
```

## Publishing the npm package (held)

The SDK `package.json` is at `1.0.0` and a **local** `v1.0.0` git tag exists, but **publish is
held** — no `hosaka-fm` npm org yet. `release.yml` is fail-closed (gated on repo var
`PUBLISH_ENABLED=true` + secret `NPM_TOKEN`). To publish when ready: (1) create the `hosaka-fm` npm
org; (2) set `NPM_TOKEN` (automation token) + `PUBLISH_ENABLED=true`; (3) `git push origin v1.0.0`
(or run the Release workflow). Until then the tag is intentionally local-only.

## ⚠️ Pre-launch

ABC Schengen is the **trial** font here (gitignored). Acquire the Dinamo webfont license and drop
the licensed woff2 into `site/public/fonts/abc-schengen/` before treating this as public/launched.
