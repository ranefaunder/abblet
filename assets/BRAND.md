# Remiix brand

## Slogan

```
Remiix — Remix any app, or make your own.
```

Finnish:

```
Remiix — Remixaa mikä tahansa app tai tee oma.
```

## Elevator pitch

```
Remiix is an app store where apps are not fixed products. Start with an app someone has already made and adapt it to your needs with a prompt, or turn your own idea into a new app from scratch. Instead of settling for software that almost fits, make software that does.
```

Finnish:

```
Remiix on app store, jossa apit eivät ole kiinteitä tuotteita. Aloita jonkun jo tekemästä appista ja sovita se tarpeisiisi promptilla — tai tee omasta ideastasi uusi app nollasta. Älä tyydy ohjelmistoon, joka melkein sopii: tee ohjelmisto, joka sopii.
```

## Where it belongs

**Slogan**

- Document / tab title and default meta description
- PWA / webmanifest short description (use the clause after the em dash, or the full line when space allows)
- Front page / marketing hero

**Elevator pitch**

- Front page body (primary home for the pitch)
- Longer marketing or share blurbs when a paragraph is needed

The splash index (`/:lang/`) is for cold visitors: wordmark (not app icon) + clarifying
headline/pitch + one CTA (Browse the Store). No bottom tabs. Prefer plain language over
“remix” jargon on splash; keep the brand slogan for titles/meta and About.
About / longer marketing lives at `/:lang/about`. Product chrome is the floating bottom tabs
(Apps · Games · Create · Me · About); Apps browse is `/:lang/apps`, Games `/:lang/games`.

## Where it does not belong

- Do not invent alternate slogans or pitches in UI copy
- Do not put the slogan on every Store card or section heading
- App-level store `tagline` fields are per-app marketing lines — not this brand slogan

## Related assets

| File | Use |
|------|-----|
| [`../static/images/remiix.svg`](../static/images/remiix.svg) | Wordmark (header, About) |
| [`../static/images/remiix-app-icon.jpg`](../static/images/remiix-app-icon.jpg) | App icon source (favicon + PWA); regenerate rasters: `bun run gen:favicons` |
| [`../static/favicons/`](../static/favicons/) | Raster favicons / PWA icons from `remiix-app-icon.jpg` |
| [`../static/images/remiix-icon-dark.svg`](../static/images/remiix-icon-dark.svg) | Monochrome mark (light chrome / inline UI) |
| [`../static/images/remiix-icon-light.svg`](../static/images/remiix-icon-light.svg) | Monochrome mark (dark chrome; Patch badge) |
| [`rmix.sketch`](rmix.sketch) | Design source (legacy filename) |
| [`TRADEMARK.md`](TRADEMARK.md) | Alustava tavaramerkkiselvitys |

## Voice (short)

Prefer concrete verbs (remix, create, install, adapt) over abstract product jargon. Apps are mutable — remixed or made from scratch — not fixed shelf products.
