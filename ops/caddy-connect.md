# Caddy: remiix.app + allow app subdomain calls only to /api/sdk/*

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

## CSRF / Origin (Caddy + Bun)

Session cookie is `Domain=remiix.app`, so `evil.remiix.app` can send it to `https://remiix.app/api/...` (same-site). Defense in depth:

**Caddy `(remiix_site)`:**

```caddy
# Foreign sites
@cross_site expression ({http.request.method} == "POST" || {http.request.method} == "PUT" || {http.request.method} == "DELETE") && {http.request.header.Origin} != "" && {http.request.header.Origin} != "https://remiix.app" && !{http.request.header.Origin}.endsWith(".remiix.app")
respond @cross_site 403

# App subdomain → platform cookie API (not SDK)
@platform_csrf expression {http.request.uri.path}.startsWith("/api/") && !{http.request.uri.path}.startsWith("/api/sdk/") && {http.request.header.Origin}.endsWith(".remiix.app")
respond @platform_csrf 403
```

- `/api/sdk/*` stays open for `*.remiix.app` Origins (exchange, ai, session, remix).
- Bun still enforces Origin on SDK routes and on cookie-auth `/api/:lang/*` (`platformCookieOriginForbidden`).

Also keep `https://remiix.app` / `https://*.remiix.app` and `https://remiix.b-cdn.net` in CSP.

## App env

```bash
APP_RUNTIME_HOST=remiix.app
PLATFORM_ORIGIN=https://remiix.app
```
