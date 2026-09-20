# Static demo build

The static demo serves the workspace overview and a locally paced sample investigation. Report intake, runtime settings, and actions that would change external state are disabled. No `.env` file or live worker is needed.

Use Node.js 20 or newer:

```sh
cd repro-console
npm ci
npm run build:demo-static
```

The deployable files are written to `static-demo-out/`. The build stages an allowlisted copy under `.static-demo-build/`, so it does not use or replace the regular Next.js `.next/` build.

To preview locally:

```sh
python3 -m http.server 8080 --directory static-demo-out
```

Open `http://localhost:8080/`; the demo investigation is available at `/runs/demo/`.

## AWS deployment

The production static site uses a private S3 bucket behind CloudFront Origin Access Control (OAC):

- Region: `us-east-1`
- Bucket: `patch-htn26-demo-535515637762`
- CloudFront distribution: `E3FB1ZS2BVL94B`
- CloudFront hostname: `d3m0wvdt6ljdw.cloudfront.net`
- Custom domain: `patch.pantheonofducks.com`
- ACM certificate in `us-east-1`: `1e96fdd0-d8df-4ce3-b1c0-a14808cd9549`

After rebuilding, publish both cache groups without `--delete`. Keeping older hashed `_next` assets lets clients that already loaded the previous HTML finish using its chunks:

```sh
cd repro-console
npm run build:demo-static
aws s3 sync static-demo-out s3://patch-htn26-demo-535515637762 \
  --region us-east-1 \
  --exclude "_next/*" \
  --cache-control "public,max-age=60"
aws s3 sync static-demo-out/_next s3://patch-htn26-demo-535515637762/_next \
  --region us-east-1 \
  --cache-control "public,max-age=31536000,immutable"
aws cloudfront create-invalidation \
  --distribution-id E3FB1ZS2BVL94B \
  --paths "/*"
```

The DNS CNAME is `patch.pantheonofducks.com` → `d3m0wvdt6ljdw.cloudfront.net`. Keep the certificate validation CNAME for renewal: `_6cbc59065ae1c362dcbf257dc9eac82d.patch` → `_40037093eacc6dba88bb2d76c0299cf9.wzccmgtwzk.acm-validations.aws`.
