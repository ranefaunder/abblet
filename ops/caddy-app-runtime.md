# Caddy: abblet.com + app subdomains

## Site blocks (platform + app runtime = same apex)

Cloudflare orange-cloud + **Full (strict)** → Origin CA wildcard on the server:

```caddy
(abblet_app_origin_tls) {
	tls /etc/caddy/certs/abblet.com.crt /etc/caddy/certs/abblet.com.key
}

www.abblet.com {
	import abblet_app_origin_tls
	redir https://abblet.com{uri} permanent
}

abblet.com {
	import abblet_app_origin_tls
	import abblet_platform_headers
	import abblet_cross_site
	reverse_proxy localhost:8090
}

*.abblet.com {
	import abblet_app_origin_tls
	import abblet_app_runtime_headers
	import abblet_cross_site
	reverse_proxy localhost:8090
}
```

## Legacy remiix.app → apex (same path)

No subdomain preservation (`73850.remiix.app/install` → `abblet.com/install`):

```caddy
(remiix_legacy_tls) {
	tls /etc/caddy/certs/remiix.app.crt /etc/caddy/certs/remiix.app.key
}

www.remiix.app {
	import remiix_legacy_tls
	redir https://abblet.com{uri} permanent
}

remiix.app {
	import remiix_legacy_tls
	redir https://abblet.com{uri} permanent
}

*.remiix.app {
	import remiix_legacy_tls
	redir https://abblet.com{uri} permanent
}
```

## Origin CA (Cloudflare)

1. Cloudflare → abblet.com zone → **SSL/TLS** → **Origin Server** → Create Certificate  
2. Hostnames: `abblet.com`, `*.abblet.com`  
3. Save PEM cert + key on server as `/etc/caddy/certs/abblet.com.crt` and `.key` (owner `caddy`, key mode `640`)  
4. `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`

DNS: `A`/`AAAA` `@` and `*` → origin IP, proxied (orange).

## Session cookie + CSRF

Session cookie is **host-only** on `abblet.com` (no `Domain=`). App subdomains never *receive* it for their own Host, but same-site `fetch("https://abblet.com/api/…", { credentials: "include" })` from `{slug}.abblet.com` **does** send the cookie to apex.

Defense in depth:

1. **Caddy** blocks foreign Origins on mutating methods (allows `https://abblet.com` and `*.abblet.com` for SDK):

```caddy
@cross_site expression ({http.request.method} == "POST" || {http.request.method} == "PUT" || {http.request.method} == "DELETE") && {http.request.header.Origin} != "" && {http.request.header.Origin} != "https://abblet.com" && !{http.request.header.Origin}.endsWith(".abblet.com")
respond @cross_site 403
```

2. **Bun** `platformApiOnly` requires `Origin`/`Referer` === `PLATFORM_ORIGIN` for mutating `/api/:lang/*`.

3. **`/api/sdk/*`** uses Bearer runtime tokens + Origin↔appSlug checks.

## App env

```bash
APP_RUNTIME_HOST=abblet.com
PLATFORM_ORIGIN=https://abblet.com
```

## Runtime hosts

- Published: `{numericSlug}.abblet.com`
- Unpublished preview: `{appIdUuid}.abblet.com` (capability URL — knowing the UUID grants access)
