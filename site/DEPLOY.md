# Deploy — crate-sdk.0xhoneyjar.xyz (AWS)

The docs site is hosted in **hosaka's AWS** (account 891376933289), not Vercel — even though
`0xhoneyjar.xyz` is otherwise wildcarded to Vercel. `crate-sdk.0xhoneyjar.xyz` is an **explicit
Route 53 override** of that wildcard.

## Live URL
https://crate-sdk.0xhoneyjar.xyz  (CloudFront `d2yj9i2xm8iq8p.cloudfront.net`)

## Resources (us-east-1)
| Resource | Id |
|---|---|
| S3 bucket (private, OAC) | `crate-docs-0xhoneyjar-xyz` |
| CloudFront distribution | `E13QRD6NNZ3UCF` |
| CloudFront function (dir-index rewrite) | `crate-docs-index-rewrite` |
| Origin Access Control | `E2GZ3UHH9BQQ9E` |
| ACM cert (us-east-1) | for `crate-sdk.0xhoneyjar.xyz` |
| Route 53 zone | `Z01393483Y40WF3N1H76` (0xhoneyjar.xyz) |

## DNS overrides (explicit, beat the `*.0xhoneyjar.xyz` Vercel wildcard)
- `crate-sdk.0xhoneyjar.xyz` A/AAAA alias → CloudFront
- `crate-sdk.0xhoneyjar.xyz` CAA → `amazon.com` (so ACM can issue; wildcard CAA is Vercel CAs)
- `_<token>.crate-sdk.0xhoneyjar.xyz` CNAME → ACM DNS validation

## Redeploy (after `npm run build`)
```sh
cd site && npm run build
aws s3 sync dist s3://crate-docs-0xhoneyjar-xyz --delete
aws cloudfront create-invalidation --distribution-id E13QRD6NNZ3UCF --paths '/*'
```

## ⚠️ Pre-launch
ABC Schengen is the **trial** font here (gitignored). Acquire the Dinamo webfont license and drop
the licensed woff2 into `site/public/fonts/abc-schengen/` before treating this as public/launched.
