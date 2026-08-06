# Caddy: remiix.app + app subdomains

## Site blocks (platform + app runtime = same apex)

Cloudflare orange-cloud + **Full (strict)** → Origin CA wildcard on the server:

```caddy
(remiix_app_origin_tls) {
	tls /etc/caddy/certs/remiix.app.crt /etc/caddy/certs/remiix.app.key
}

www.remiix.app {
	import remiix_app_origin_tls
	redir https://remiix.app{uri} permanent
}

remiix.app {
	import remiix_app_origin_tls
	import remiix_site
}

*.remiix.app {
	import remiix_app_origin_tls
	import remiix_site
}
```

Legacy `rmix.app` / `abblet.app` redirect at Caddy (and Bun via `redirectLegacyHost`).

## Origin CA (Cloudflare)

1. Cloudflare → remiix.app zone → **SSL/TLS** → **Origin Server** → Create Certificate  
2. Hostnames: `remiix.app`, `*.remiix.app`  
3. Save PEM cert + key on server as `/etc/caddy/certs/remiix.app.crt` and `.key` (owner `caddy`, key mode `640`)  
4. `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`

DNS: `A`/`AAAA` `@` and `*` → origin IP, proxied (orange).

## Session cookie + CSRF

Session cookie is **host-only** on `remiix.app` (no `Domain=`). App subdomains never *receive* it for their own Host, but same-site `fetch("https://remiix.app/api/…", { credentials: "include" })` from `{slug}.remiix.app` **does** send the cookie to apex.

Defense in depth:

1. **Caddy** blocks foreign Origins on mutating methods (allows `https://remiix.app` and `*.remiix.app` for SDK):

```caddy
@cross_site expression ({http.request.method} == "POST" || {http.request.method} == "PUT" || {http.request.method} == "DELETE") && {http.request.header.Origin} != "" && {http.request.header.Origin} != "https://remiix.app" && !{http.request.header.Origin}.endsWith(".remiix.app")
respond @cross_site 403
```

2. **Bun** `platformApiOnly` requires `Origin`/`Referer` === `PLATFORM_ORIGIN` for mutating `/api/:lang/*` — so app subdomains cannot CSRF cookie APIs even though Caddy allows their Origin for SDK.

3. **`/api/sdk/*`** uses Bearer runtime tokens + Origin↔appSlug checks (not the platform cookie). `/api/sdk/remix` is Bearer-only.

4. **`/permission/:appId`** requires a one-time session nonce (from the SPA permission page or Store Open) before minting a runtime code.

## Recommended CSP split (Caddy)

Platform + shared `abblet_security_headers` may allow `connect-src … https://*.remiix.app`. Prefer a **tighter** policy on app subdomains so generated apps cannot talk to arbitrary hosts (Bun also sets a tight app-runtime CSP; browsers AND multiple CSP headers):

```caddy
(remiix_app_runtime_csp) {
	header {
		# Tighter than platform: connect only to self + platform apex (SDK).
		Content-Security-Policy "default-src 'self'; font-src 'self' data: https://remiix.b-cdn.net; img-src 'self' data: blob: https://remiix.b-cdn.net; connect-src 'self' https://remiix.app; style-src 'self' 'unsafe-inline' https://remiix.b-cdn.net; script-src 'self' 'unsafe-inline'; manifest-src 'self' https://remiix.b-cdn.net; frame-ancestors 'none'"
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		X-Frame-Options "DENY"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(), usb=(), fullscreen=(self)"
	}
}

*.remiix.app {
	import remiix_app_origin_tls
	import remiix_app_runtime_csp
	# same reverse_proxy / cross_site as remiix_site minus broad connect-src
	@cross_site expression ({http.request.method} == "POST" || {http.request.method} == "PUT" || {http.request.method} == "DELETE") && {http.request.header.Origin} != "" && {http.request.header.Origin} != "https://remiix.app" && !{http.request.header.Origin}.endsWith(".remiix.app")
	respond @cross_site 403
	reverse_proxy localhost:8090
}
```

Keep `https://remiix.app` / CDN / Umami in the **apex** CSP as today.

## App env

```bash
APP_RUNTIME_HOST=remiix.app
PLATFORM_ORIGIN=https://remiix.app
# Cloudflare sets CF-Connecting-IP; optional if not on CF:
# TRUSTED_PROXY=1
```

## Runtime hosts

- Published: `{numericSlug}.remiix.app`
- Unpublished preview: `{appIdUuid}.remiix.app` (capability URL — knowing the UUID grants access)
