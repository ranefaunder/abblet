# Remiix — tietoturva-auditointi (2026-08-04)

Staattinen koodikatselmus koko koodikannasta: autentikointi/sessiot, API-valtuutus/IDOR, injektiot & AI-generoidun koodin suoritus, CORS/HTTP-tietoturva. Ei tunkeutumistestausta. **Ei vielä korjattu — korjataan myöhemmin.**

Kanava/live-versio (taulukot): `.cursor/projects/Users-rane-faunder-remiix/canvases/security-audit-remiix.canvas.tsx`

Yhteenveto: **3 kriittistä, 6 vakavaa, 3 keskitason, 6 matalaa, 6 info**-tason löydöstä.

---

## Kriittiset

1. **`server/api/auth/register.ts:65-86`** (Autentikointi) — Rekisteröinti kutsuu `createAuthSession()` heti käyttäjän luonnin jälkeen todistamatta sähköpostin omistusta (ei kirjautumiskoodia, vain tervetuloviesti). Hyökkääjä voi rekisteröityä uhrin sähköpostiosoitteella ja saada välittömästi täyden, pitkäikäisen istunnon tiliin (account pre-hijacking). Vertaa `verify-login-code.ts`, joka vaatii oikean koodin ennen istunnon myöntämistä — rekisteröinnissä tätä ei ole.

2. **`utils/ai-apps.server.ts:143-180`** + ei CSP:tä missään (AI-koodin suoritus) — AI:n generoima sovelluskoodi ajetaan täysin sandboxoimattomana omalla origin-alueellaan. "Ei raakaa fetch/XHR:ää" on vain system-promptin ohje LLM:lle, ei teknisesti pakotettu (ainoa jälkitarkistus on tagName-merkkijonon esiintyminen koodissa). Prompt-injektiolla saatu haitallinen koodi voi varastaa käyttäjän tokenit/datan ulkopuoliselle palvelimelle.

3. **`utils/auth.server.ts:40-51`** + kaikki tilaa muuttavat `/api/*`-reitit (CSRF) — Kaikki AI-sovellukset ajetaan `{slug}.remiix.app`-alidomaineissa, jotka ovat evästeiden "same-site"-käsittelyssä samaa sivustoa kuin alusta itse. `SameSite=Lax` ei siis estä niitä tekemästä cross-origin fetch-kutsuja alustan API:in käyttäjän istunnolla (tilin poisto, tilauksen peruutus, remix). Ei CSRF-tokenia eikä Origin/Referer-tarkistusta yhdelläkään mutatoivalla reitillä.

## Vakavat

4. **`server/api/app/remix.ts:64-118`, `server/api/sdk/remix.ts:66-118`** (Valtuutus/kustannukset) — Remix tekee kaksi maksullista AI-kutsua (nimi/kuvaus + ikoni) ilman `assertHasCredits`-tarkistusta tai jälkikäteisveloitusta — epäjohdonmukaista verrattuna `regenerate-icon.ts`:ään. Käyttäjä, jonka saldo on 0, voi silti remiksata rajattomasti ja saada ilmaisia AI-kutsuja alustan piikkiin.

5. **`server/api/app/get.ts:44-107`** (Valtuutus/kustannukset) — Draftin täydennysreitti kutsuu AI-generointia ilman credit-, veloitus- tai rate-limit-suojaa. Reitti hyväksyy pelkän capability-host-tunnistuksen (Host-otsake), joten kutsu on mahdollinen myös kirjautumattomana jos esikatselulinkki vuotaa.

6. **`server/routes/app.ts:104-108`, `server/routes/app-page.ts:1027-1099`** (Tallennettu XSS) — `window.__SSR_CONTEXT__`/`__REMIIX__` upotetaan `<script>`-tunnisteeseen suoraan `JSON.stringify`:llä ilman `</script>`-sekvenssin pakoa. AI-generoitu appin nimi/kuvaus voisi prompt-injektiolla sisältää merkkijonon joka katkaisee script-tagin ja suorittaa mielivaltaista JS:ää alustan omalla originilla.

7. **`static/remiix-app.js:262-348`, `server/api/sdk/ai.ts:58-73`** (Token-varkaus) — Runtime-bearer-token on luettavissa app-origin JS:stä (`Remiix.getToken()`) ja tallessa sessionStoragessa. Palvelimen Origin-header-tarkistus ei sido tokenia kryptografisesti selaimeen — varastettu token toimii yhtä lailla curlista/Postmanista väärennetyllä Origin-otsakkeella tunnin ajan.

8. **`utils/request.server.ts:36-43,109-115`** (`getClientIP`, Rate-limit-kierto) — Asiakkaan IP-osoite luetaan X-Forwarded-For-ketjun ensimmäisestä arvosta ilman validointia luotetusta reverse proxysta. Kaikki IP-pohjaiset rajoitukset (login-koodi, rekisteröinti, feedback, generointi) ohitettavissa lähettämällä eri väärennetty XFF-arvo joka pyynnöllä.

9. **`server/api/auth/verify-login-code.ts:33-41`** (yhdessä #8:n kanssa, Bruteforce) — 6-numeroisen login-koodin (1 000 000 yhdistelmää, 10 min voimassa) bruteforce-suoja on sidottu vain IP-osoitteeseen, ei koodiin/sähköpostiin. Koska IP on spoofattavissa, tiettyyn sähköpostiin lähetetty koodi on käytännössä murrettavissa 10 minuutin ikkunassa.

## Keskitasoa

10. **`utils/credits.server.ts:127-168`** (esim. `edit.ts`, `generate.ts`, `regenerate-icon.ts`; kilpa-ajo/TOCTOU) — Krediittisaldo tarkistetaan (> 0) ennen kallista AI-kutsua, veloitus tapahtuu vasta jälkikäteen. Rinnakkaiset pyynnöt (esim. 20 samanaikaista editointikutsua) läpäisevät kaikki tarkistuksen ennen kuin veloitus ehtii vaikuttaa saldoon.

11. **`server/api/auth/request-login-code.ts:50-57`, `register.ts:60-63`** (Tilien enumerointi) — Vastaus paljastaa suoraan onko sähköpostiosoite jo rekisteröity (`USER_NOT_FOUND` 404 vs. `{existingUser: true}`).

12. **Koko palvelin** (`server/server.ts` ja kaikki reitit; HTTP-turvaotsikot) — Ei `Content-Security-Policy`-, `X-Frame-Options`/`frame-ancestors`-, `X-Content-Type-Options`-, `Referrer-Policy`- eikä `Strict-Transport-Security`-otsikkoa yhdelläkään reitillä.

## Matalat

13. **`server/api/billing/redeem-gift.ts:1-58`** — Ei rate limitiä lahjakoodin lunastukselle; koodit (`REMIIX-FRIENDS`, `EARLYACCESS`) ovat jaettuja/arvattavia merkkijonoja.

14. **`server/api/app/edit.ts:563`, `server/api/app/generate.ts:46`** — `checkRateLimit` avaimistetaan IP:llä vaikka reitti on jo autentikoitu — pitäisi käyttää `userId`:tä kuten `sdk/ai.ts` tekee oikein.

15. **`server/routes/connect.ts:36-73`** — GET-reitti tekee tilaa muuttavan DB-kirjoituksen (yhdistämiskoodin luonti) ilman vahvistusta; ei myöskään tarkista sovelluksen näkyvyyttä (private/draft) ennen koodin myöntämistä.

16. **`server/database/queries/login-codes.ts:12-26`** — Koodivertailu SQL:n `=`-operaattorilla, ei vakioaikaisella vertailulla (pieni ajoitusriski).

17. **`server/routes/app-page.ts:1005-1010`** — `innerHTML` ilman escapointia virheviestille; ei hyödynnettävissä juuri nyt mutta hauras rakenne.

18. **`server/database/queries/apps.ts:145-197`** — LIKE-jokerimerkin neutralointi poistaa vain `%`-merkin, ei `_`:ää (kosmeettinen, ei injektioriski).

## Info

- **`utils/auth.server.ts:46`** — Eväste saa `Secure`-lipun vain kun `NODE_ENV === "production"`.
- **`server/api/auth/register.ts:50`, `utils/email.server.ts:63`** — `APPSTUDO_E2E_SKIP_EMAIL=1` ohittaa rate limitin ja sähköpostin lähetyksen ilman eksplisiittistä prod-suoraa koodissa.
- **`utils/sdk-cors.server.ts:19-41`** — Kommentti olettaa host-only-evästeen suojaavan alidomaineilta CSRF:ltä — virheellinen oletus (ks. kriittinen #3).
- **`utils/app-host.ts:66-71`, `utils/meta.server.ts:42,62`** — `og:url`/meta perustuu Host-otsikkoon ilman sallittua listaa (riippuu infran asetuksista).
- **`server/database/migrate.ts:39`** — Dynaaminen import kiinteästä hakemistosta, ei hyväksikäytettävissä nykyisellään.
- **`server/database/migrations/013_guest_users.ts`** — Guest-käyttäjät vaikuttavat kuolleelta ominaisuudelta, ei aktiivista riskiä.

---

## Hyvät käytännöt jo käytössä

- Kaikki SQL-kyselyt parametrisoituja (`bun:sqlite`), ei string-konkatenoitua SQL:ää.
- HTML escapetaan johdonmukaisesti (`escapeHtmlAttribute`/`escapeHtmlTextContent`); AI-koodin syntaksikorostin escapettaa tokenit ennen `dangerouslySetInnerHTML`-käyttöä.
- Login-koodit `crypto.randomInt`:lla, sessio/SDK-tokenit `crypto.randomUUID()`:lla — korkea entropia.
- Käytetyt login-koodit merkitään; connect-koodit/runtime-tokenit kulutetaan atomisesti transaktiossa, lyhyt TTL (60s/1h).
- Omistajuustarkistus kahteen kertaan: reittitasolla ja `AND owner_id = ?` itse SQL:ssä.
- Kauppalistaus pakottaa `visibility='public' AND is_draft=0` palvelinpuolella.
- CORS rajattu tunnistettuihin app-runtime-originaaleihin, ei wildcardia.
- Staattisten tiedostojen tarjoilu estää polkuloukut, rajaa tiedostopäätteet ja koon.
- Salaisuudet vain `*.server.ts`-tiedostoissa; `.env.example` sisältää vain placeholdereita.
- SDK-reitit sitovat bearer-tokenin sekä `userId`:hen että `appSlug`:iin.

---

## Suositeltu korjausjärjestys

1. Vaadi sähköpostin varmistus (login-koodi) ennen istunnon myöntämistä rekisteröinnissä.
2. Lisää CSP (erit. `frame-ancestors`, tiukka `script-src`), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS.
3. Lisää CSRF-suoja (Origin/Referer-tarkistus tai token) kaikille mutatoiville `/api/*`-reiteille.
4. Korjaa JSON→`<script>`-upotukset escapoimaan `</script>`-sekvenssit.
5. Korjaa `getClientIP` luottamaan vain infran asettamaan otsikkoon (esim. `CF-Connecting-IP`); sido login-koodin bruteforce-suoja myös koodiin/sähköpostiin.
6. Lisää credit-tarkistus ja veloitus remix- ja draft-täydennysreiteille (`app/remix.ts`, `sdk/remix.ts`, `app/get.ts`).
7. Harkitse tekninen valvonta (CSP `connect-src`, iframe sandbox, tai staattinen analyysi) AI:n generoiman koodin verkkokutsuille pelkän system-prompt-ohjeen sijaan.
