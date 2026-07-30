# Caddy: remiix.app + allow app subdomain POSTs to /api/sdk/*

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

Legacy `rmix.app` / `abblet.app` can keep their blocks (or redirect at Caddy). Bun also 301s them via `redirectLegacyHost`.

## Origin CA (Cloudflare)

1. Cloudflare → remiix.app zone → **SSL/TLS** → **Origin Server** → Create Certificate  
2. Hostnames: `remiix.app`, `*.remiix.app`  
3. Save PEM cert + key on server as `/etc/caddy/certs/remiix.app.crt` and `.key` (owner `caddy`, key mode `640`)  
4. `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`

DNS: `A`/`AAAA` `@` and `*` → origin IP, proxied (orange).

## CORS / POST allowlist

App runtimes (`*.remiix.app`, optionally legacy `*.rmix.app` / `*.abblet.app`) call:

- `POST /api/sdk/exchange` — connect code → runtime token
- `POST /api/sdk/ai` — `Remiix.ai({ prompt })`

Update `(remiix_site)` `@cross_site` so these Origins are **not** blocked:

```caddy
@cross_site expression ({http.request.method} == "POST" || {http.request.method} == "PUT" || {http.request.method} == "DELETE") && {http.request.header.Origin} != "" && {http.request.header.Origin} != "https://remiix.app" && !{http.request.header.Origin}.endsWith(".remiix.app")
respond @cross_site 403
```

Also keep `https://remiix.app` / `https://*.remiix.app` in the CSP used by `remiix_site`.

CORS headers for `/api/sdk/*` are set by the Bun app; Caddy must not reject the request before it reaches Bun.

## App env

```bash
APP_RUNTIME_HOST=remiix.app
PLATFORM_ORIGIN=https://remiix.app
```
