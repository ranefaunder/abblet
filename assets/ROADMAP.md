# Remiix — seuraavat vaiheet

Järjestys: **sync ensin**, sitten **Polar**. Sync tekee apista “oikean tuotteen” (data ei katoa); Polar muuttaa sen liiketoiminnaksi.

Liittyy: [`BRAND.md`](BRAND.md), [`TRADEMARK.md`](TRADEMARK.md).

---

## 1. Remiix.sync() — app-tason pilvidata

SDK on jo sama malli: `Remiix.connect()` → Bearer → `/api/sdk/*`. Offline-copy sanoo, että app-data toimii offline — sync täydentää sen pilveen kun käyttäjä on connected.

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

### Malli

1. **Tuote(et)** Polarissa — esim. Pro-tilaus (€/kk) ja/tai credit-paketit (one-time)
2. Checkout serverillä (OAT), `customer_external_id` / metadata = Remiix `user.id`
3. Webhookit: `subscription.*`, `order.paid` → päivitä paikallinen entitlement (`plan`, `polar_customer_id`, …)
4. Me-sivulle: “Manage billing” → Polar Customer Session / portal

### Creditiin suhde

Nykyinen **kuukausittainen free grant** (`CREDIT_FREE_GRANT_USD`) + Polar Pro rinnakkain:

- free = grant
- paid = isompi grant, soft-cap, tai credit top-up

Polar-saldoa ei sekoiteta OpenRouter-debitiin suoraan — oma ledger; Polar vain täyttää / entitlee.

### Toteutus

1. Polar sandbox: yksi subscription + webhook
2. DB: `plan` / `polar_customer_id` (users tai erillinen taulu)
3. Me: tilaus-CTA + portal
4. Credit-grant planin mukaan

Pidä Polar **erillisenä PR:nä** syncin jälkeen.
