# Abblet — seuraavat vaiheet

Järjestys: **JSON-sync on valmis** → **Polar** → myöhemmin **tiedostojen sync**.

**Valmis:** Premium-entitlement + gift-koodit (`users.plan`, `gift_codes`, `/api/:lang/billing/*`). Polar = provider-vaihto samaan `setUserPlan`-polkuun.

**Valmis:** `Abblet.sync()` — yksi JSON-blob per user × app, last-write-wins `updatedAt`-leimalla (host-cache + palvelin).

Liittyy: [`BRAND.md`](BRAND.md), [`TRADEMARK.md`](TRADEMARK.md).

---

## 1. Abblet.sync() — app-tason pilvidata ✅

SDK: `Abblet.requestPermission()` → Bearer → `/api/sdk/sync`. localStorage offline; sync overlay kun lupa annettu (avauksessa permission-sivu, kuten AI).

### API (app runtime)

```js
await Abblet.sync()        // → data | null (LWW: uudempi cloud vs host-pending)
await Abblet.sync(state)   // JSON, max 128 KB, aikaleimattu write
await Abblet.sync(null)    // tyhjennä blob
```

### Päätökset (v1) — toteutettu

| Päätös | Toteutus |
|--------|----------|
| Scope | user × app (slug) |
| Tallennus | yksi JSON-blob + `updated_at`, 128 KB |
| Konflikti | last-write-wins `updatedAt` (host-cache + palvelin hylkää vanhemman PUT:in) |
| Auth | runtime token + `sync`-grant; lupa bootissa |
| Offline | localStorage ensisijainen; host leimaa pendingin heti |

### Jäljellä / ei nyt

- Kenttätason merge / CRDT — ei suunnitteilla v1:lle
- **Tiedostojen sync** → erillinen kohta alla

---

## 2. Polar.sh — maksut ja tilaukset

Polar: Checkout + webhooks + Customer Portal (ei korttien säilytystä meillä).

**Entitlement on jo paikallinen:** `users.plan` (`free` | `premium`), `plan_source` (`gift` | `polar`), kuukausigrant planin mukaan (`CREDIT_FREE_GRANT_USD` / `CREDIT_PREMIUM_GRANT_USD`). Gift-redeem: `POST /api/:lang/billing/redeem-gift`. UI: Me, About `#plans`, Create credit-wall, Premium-dialog.

### Malli (Polar-PR)

1. Tuote Polarissa — Premium **$5.99/mo** (grant $5.99, 1:1)
2. Checkout serverillä (OAT), `customer_external_id` / metadata = Abblet `user.id`
3. Webhookit: `subscription.*`, `order.paid` → sama `setUserPlan(userId, "premium", { source: "polar" })` + `applyPlanGrant` kuin gift
4. Me-sivulle: “Manage billing” → Polar Customer Session / portal
5. `BILLING_PROVIDER` tai checkout-endpoint: UI jo valmis gift-redeemille; Polar lisää `{ checkoutUrl }` -polun

### Creditiin suhde

- free = `CREDIT_FREE_GRANT_USD` (oletus $0.99)
- premium = `CREDIT_PREMIUM_GRANT_USD` (oletus $5.99)
- markup = `CREDIT_MARKUP` (oletus 5×)
- Gift-koodit (`gift_codes`) jäävät Polarinkin rinnalle testaajille / lähipiirille

Polar-saldoa ei sekoiteta OpenRouter-debitiin suoraan — oma ledger; Polar vain täyttää / entitlee.

### Toteutus

1. Polar sandbox: yksi subscription + webhook
2. Täytä `polar_customer_id` / `polar_subscription_id` (sarakkeet jo migraatiossa)
3. Me: maksettu checkout-CTA + portal (gift-redeem säilyy)
4. Grandfather: `plan=premium` + `plan_source=gift` ilman Polar-tilausta

Pidä Polar **erillisenä PR:nä**.

---

## 3. Tiedostojen sync — myöhemmin (ei vielä)

Nyt kuvat/liitteet elävät vain **OPFS**:ssä (laitteella). JSON-sync ei tunge binäärejä 128 KB blobiin.

### Tavoite

Appi voi synkata tiedostoja (kuvat, liitteet) laitteiden välillä samalla `sync`-luvalla tai erillisellä scopella — metadata JSON:issa, bytet pilvessä / object storagessa.

### Luonnos (kun aika on)

| Päätös | Suunta |
|--------|--------|
| API | esim. `Abblet.files.put(name, blob)` / `get` / `list` / `delete` — tai sync-laajennus |
| Tallennus | object storage + viite appin tilassa (ei base64 JSON:iin) |
| Koko / kiintiö | per-user × app limiitti; thumbnailit paikallisesti OPFS:ään |
| Offline | OPFS ensisijainen; upload/download kun online |
| Lupa | todennäköisesti sama `sync` (data seuraa käyttäjää) — päätetään toteutuksessa |

**Ei aloiteta** ennen kuin Polar on linjassa ja JSON-sync on tuotannossa riittävän pitkään.
