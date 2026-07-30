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

Session cookie is **host-only** on `remiix.app` (no `Domain=`). App subdomains never receive it, so same-site CSRF from `{slug|uuid}.remiix.app` → platform cookie APIs is not possible via cookie.

Caddy still blocks foreign Origins on mutating methods:

```caddy
@cross_site expression ({http.request.method} == "POST" || {http.request.method} == "PUT" || {http.request.method} == "DELETE") && {http.request.header.Origin} != "" && {http.request.header.Origin} != "https://remiix.app" && !{http.request.header.Origin}.endsWith(".remiix.app")
respond @cross_site 403
```

App runtimes call `/api/sdk/*` (exchange, ai, session, remix) with their Origin; Bun enforces Origin checks. Keep `https://remiix.app` / `https://*.remiix.app` and `https://remiix.b-cdn.net` in CSP.

## App env

```bash
APP_RUNTIME_HOST=remiix.app
PLATFORM_ORIGIN=https://remiix.app
```

## Runtime hosts

- Published: `{numericSlug}.remiix.app`
- Unpublished preview: `{appIdUuid}.remiix.app` (capability URL — knowing the UUID grants access)
