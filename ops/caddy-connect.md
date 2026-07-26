# Caddy: allow app subdomain POSTs to /api/sdk/*

App runtimes (`*.abblet.app`, locally `*.app.localhost`) call:

- `POST /api/sdk/exchange` — connect code → runtime token
- `POST /api/sdk/ai` — `Abblet.ai({ prompt })`

These are cross-origin POSTs to the platform (`abblet.com` / `localhost:8090`).

Update the Abblet site snippet `@cross_site` matcher so Origins ending in
`.abblet.app` (and `https://abblet.app` if needed) are **not** blocked:

```caddy
@cross_site expression ({http.request.method} == "POST" || {http.request.method} == "PUT" || {http.request.method} == "DELETE") && {http.request.header.Origin} != "" && {http.request.header.Origin} != "https://abblet.faunder.fi" && {http.request.header.Origin} != "https://abblet.com" && {http.request.header.Origin} != "https://abblet.app" && !{http.request.header.Origin}.endsWith(".abblet.com") && !{http.request.header.Origin}.endsWith(".abblet.app")
respond @cross_site 403
```

CORS headers for `/api/sdk/*` are set by the Bun app; Caddy must not reject the
request before it reaches Bun.

Without this change, `/connect/{slug}` and `Abblet.ai` fail with 403 at the proxy.
