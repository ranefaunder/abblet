# Remiix — seuraavat vaiheet

Järjestys: **sync ensin**, sitten **Polar**. Sync tekee apista “oikean tuotteen” (data ei katoa); Polar muuttaa sen liiketoiminnaksi.

**Valmis:** Premium-entitlement + gift-koodit (`users.plan`, `gift_codes`, `/api/:lang/billing/*`). Polar = provider-vaihto samaan `setUserPlan`-polkuun.

Liittyy: [`BRAND.md`](BRAND.md), [`TRADEMARK.md`](TRADEMARK.md).

---

## 1. Remiix.sync() — app-tason pilvidata

SDK on jo sama malli: `Remiix.requestPermission()` (ex-`connect`) → Bearer → `/api/sdk/*`. Offline-copy sanoo, että app-data toimii offline — sync täydentää sen pilveen kun käyttäjä on antanut luvan.

### API (app runtime)

```js
await Remiix.sync.get()           // → data | null
await Remiix.sync.set(data)       // JSON, koko rajoitettu
// myöhemmin: await Remiix.sync.merge(patch)
```

Vaihtoehto: yksi metodi `Remiix.sync(data?)` — get ilman argia, set argilla. Connect-flow sama kuin `Remiix.ai`.

### Päätökset (v1)

| Päätös | Suositus |
|--------|----------|
| Scope | **user × app** (slug / app id), ei jaettu kaikille |
| Tallennus | yksi JSON-blob per rivi + `updated_at` (+ koko-raja, esim. 64–256 KB) |
| Konflikti | last-write-wins; version/etag myöhemmin |
| Auth | sama runtime token; ilman tokenia → login dialog kuten AI |
| Offline | localStorage/IndexedDB ensisijainen; sync taustalla kun online |

### Toteutus

1. Migraatio: `app_user_data` (tai vastaava)
2. `GET/PUT /api/sdk/sync`
3. `Remiix.sync` companioniin (`static/remiix-app.js`)
4. Prompt-ohje AI:lle (`utils/ai-apps.server.ts`) — vanilla-apit ilman omaa backendia

---

## 2. Polar.sh — maksut ja tilaukset

Polar: Checkout + webhooks + Customer Portal (ei korttien säilytystä meillä).

**Entitlement on jo paikallinen:** `users.plan` (`free` | `premium`), `plan_source` (`gift` | `polar`), kuukausigrant planin mukaan (`CREDIT_FREE_GRANT_USD` / `CREDIT_PREMIUM_GRANT_USD`). Gift-redeem: `POST /api/:lang/billing/redeem-gift`. UI: Me, About `#plans`, Create credit-wall, Premium-dialog.

### Malli (Polar-PR)

1. Tuote Polarissa — Premium **$5.99/mo** (grant $5.99, 1:1)
2. Checkout serverillä (OAT), `customer_external_id` / metadata = Remiix `user.id`
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

Pidä Polar **erillisenä PR:nä** syncin jälkeen.
