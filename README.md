# evals-site

Static site at [`evals.zeroindex.ai`](https://evals.zeroindex.ai) hosting public eval-pack reports from ZeroIndex projects.

## What this is

Public eval reports — one self-contained HTML file per project, regenerated whenever that project's eval CI runs. Each report is produced by [`@zeroindex-ai/eval-pack`](https://github.com/zeroindex-ai/eval-pack)'s `renderHtml` (no client JS, no external assets — viewable via `file://`, embeddable via iframe).

## Layout

```
evals-site/
├── public/                       ← served as the site root
│   ├── index.html
│   ├── ask-zeroindex/
│   │   └── latest.html
│   └── dummy-agent/
│       └── latest.html
├── render.ts                     ← helper to refresh reports
├── package.json                  ← dev tooling only; not deployed
└── wrangler.jsonc
```

Each `latest.html` is a standalone HTML file produced by `eval-pack`'s `renderHtml(report, opts)` — no client JS, no external assets, safe to view via `file://` or embed via iframe.

## URL layout

```
evals.zeroindex.ai/                       → landing page (public/index.html)
evals.zeroindex.ai/<project>/latest.html  → latest run for that project
```

## Add or refresh a report

```bash
# 1. Get the source JSON. Either a fresh run:
pnpm tsx ./some-project/evals/run.ts
#    or download the latest CI artifact:
gh run download <run-id> --repo zeroindex-ai/<project> --name eval-results-<run-id> --dir artifacts/

# 2. Render the JSON to HTML in place:
pnpm render \
  --in artifacts/run-<timestamp>.json \
  --out public/<project>/latest.html \
  --project <project> \
  --threshold 0.8

# 3. Commit + push — Cloudflare auto-deploys.
git add public/<project>/latest.html && git commit -m "Refresh <project> report" && git push
```

## Deploy

`main` → Cloudflare Workers Static Assets (auto-deploy via the `cloudflare-workers-and-pages` GitHub App, same pipeline as [`zeroindexai`](https://github.com/zeroindex-ai/zeroindexai)).

## License

MIT — see [LICENSE](./LICENSE).
