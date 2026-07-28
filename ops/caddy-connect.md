# Caddy: allow app subdomain POSTs to /api/sdk/*

App runtimes (`*.rmix.app`, optionally `*.abblet.app`, locally `*.app.localhost`) call:

- `POST /api/sdk/exchange` — connect code → runtime token
- `POST /api/sdk/ai` — `Rmix.ai({ prompt })` (Abblet.ai alias)

These are cross-origin POSTs to the platform (`rmix.app` / `localhost:8090`).

Update the site snippet `@cross_site` matcher so Origins ending in
`.rmix.app` / `.abblet.app` (and apex if needed) are **not** blocked:

```caddy
@cross_site expression ({http.request.method} == "POST" || {http.request.method} == "PUT" || {http.request.method} == "DELETE") && {http.request.header.Origin} != "" && {http.request.header.Origin} != "https://abblet.faunder.fi" && {http.request.header.Origin} != "https://abblet.com" && {http.request.header.Origin} != "https://abblet.app" && {http.request.header.Origin} != "https://rmix.app" && !{http.request.header.Origin}.endsWith(".abblet.com") && !{http.request.header.Origin}.endsWith(".abblet.app") && !{http.request.header.Origin}.endsWith(".rmix.app")
respond @cross_site 403
```

CORS headers for `/api/sdk/*` are set by the Bun app; Caddy must not reject the
request before it reaches Bun.

Without this change, `/connect/{slug}` and runtime AI fail with 403 at the proxy.
