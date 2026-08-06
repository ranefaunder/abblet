# Remiix — tietoturva-auditointi (2026-08-04)

Staattinen koodikatselmus koko koodikannasta. **Korjaukset toteutettu 2026-08-05** (kolme vaihetta). **Jatkotarkistus 2026-08-05**: löytyi ja korjattiin yksi jäännösaukko (#19).

Kanava/live-versio (taulukot): `.cursor/projects/Users-rane-faunder-remiix/canvases/security-audit-remiix.canvas.tsx`

---

## Korjaustila

| # | Löydös | Tila |
|---|--------|------|
| 1 | Rekisteröinti ilman email-varmistusta | **Korjattu** — login-koodi ennen sessiota |
| 2 | AI-koodi ilman sandboxia / CSP | **Korjattu** — app-runtime CSP `connect-src 'self' + PLATFORM` (Bun + Caddy-ohje) |
| 3 | CSRF same-site alidomaineilta | **Korjattu** — platform API Origin === PLATFORM_ORIGIN; sdk/remix Bearer |
| 4–5 | Remix / draft-get ilmaiset AI-kutsut | **Korjattu** — credits + rate limit |
| 6 | JSON → `<script>` XSS | **Korjattu** — `serializeJsonForHtmlScript` |
| 7 | Token-exfil | **Mitigoitu** — CSP estää ulkoiset connectit; TTL 30 min |
| 8–9 | XFF spoof / login bruteforce | **Korjattu** — CF-Connecting-IP; email+IP rate limit |
| 10 | Credit TOCTOU | **Korjattu** — `credit_reserved_usd_micros` reserve |
| 11 | Tilien enumerointi | **Korjattu** — yhtenäiset vastaukset |
| 12 | HTTP-turvaotsikot | **Korjattu** — Bun + Caddy (ks. `ops/caddy-app-runtime.md`) |
| 13–18 | Rate/LIKE/connect/innerHTML/… | **Korjattu** |
| 19 | `permission`-reitin CSRF (ent. `connect`) | **Korjattu 2026-08-05** — istuntoon sidottu kertakäyttöinen nonce |

### Jäljellä oleva riski

- Prompt-injektio voi yhä tuottaa haitallista JS:ää app-originilla; CSP rajoittaa verkkokutsut platformiin + self.
- Bearer-token on app-JS:n luettavissa (`Remiix.getToken`); exfil ulos estetty CSP:llä, replay curlista Origin-spoofilla mahdollinen TTL:n ajan (token sidottu user+app).
- Guest-käyttäjät (`is_guest`) ovat legacy — ei aktiivista luontireittiä.
- Credit-reservaatio (`credit_reserved_usd_micros`) voi jäädä "jumiin" jos AI-kutsun jälkeinen `dbCreateApp`/ikoni-generointi kaataa poikkeuksen ennen debit/release-kutsua (`remix.ts`, `generate.ts`, `sdk/remix.ts` — `edit.ts` on jo suojattu `finally`-lohkolla). Vaikuttaa vain kyseisen käyttäjän omaan saldoon (ei toisiin käyttäjiin ulottuva hyökkäys), mutta kannattaa siivota samalla `finally`-mallilla jossain vaiheessa.

### #19: `permission`-CSRF-korjaus (ent. `connect`)

Vaiheen 2 korjauksessa `/connect/:appId` (nykyisin `/permission/:appId`) sai `confirm=1`-parametrin "vahvistukseksi" ennen koodin myöntämistä. Tämä ei kuitenkaan estänyt mitään: hyökkääjä voi laittaa `confirm=1`:n valmiiksi haitalliseen linkkiin, jolloin uhrin selain suorittaa koko toiminnon yhdellä klikkauksella.

**Korjattu**: vahvistussivu luo nyt arvaamattoman, palvelimen muistissa pidettävän kertakäyttöisen nonce-tokenin, joka on sidottu `userId + appId`-yhdistelmään ja vanhenee 10 minuutissa. Koodi myönnetään vain kun oikea, käyttämätön nonce palautetaan. (`server/routes/permission.ts`)

**2026-08-05 (permissions):** Luvan pyytäminen ajetaan vain appeille, joiden `required_permissions` sisältää `"ai"`. Grantit ovat scope-kohtaisia (`app_connect_grants.scope`, oletus `ai`). Polku on `/permission/:appId` (SPA `/:lang/permission/:appId`); vanha `/connect` ohjataan uudelleen.

**2026-08-06 (runtime data min):** App-runtime `__REMIIX__` = `{ appSlug, platformOrigin, permissions }`. Module mounttaa itsensä (`#mount`); title/lang/icon DOMista. Open-loki anonyymi. Poistettu credits/session/sdk-open.

Samalla siivottiin pois tarpeeton `return`-parametri (appit elävät aina runtime-juuressa `/`, ei muita polkuja — ks. `server/server.ts` reititystaulu), joten myös se erillinen validointi (`isOriginForApp` return-URL:lle) poistui koodista.

---

## Suositeltu Caddy (tuotanto)

Apex käyttää nykyistä `abblet_security_headers`-tyylistä CSP:tä. App-alidomaineille (`*.remiix.app`) suositellaan tiukempaa `connect-src` (vain `'self'` + `https://remiix.app`) — dokumentoitu [`ops/caddy-app-runtime.md`](../ops/caddy-app-runtime.md). Bun asettaa saman app-runtime CSP:n defense-in-depthinä (selain AND-taa useat CSP-headerit).

---

## Alkuperäiset löydökset (arkisto)

### Kriittiset

1. **`server/api/auth/register.ts`** — Rekisteröinti myönsi istunnon ilman sähköpostin varmistusta.
2. **`utils/ai-apps.server.ts`** — AI-koodi ilman teknistä sandboxia.
3. **`utils/auth.server.ts`** — CSRF alidomainien kautta (SameSite=Lax + same-site).

### Vakavat / keski / matalat

Ks. git-historia ennen 2026-08-05 korjauksia, tai canvas-tiedosto yllä.
