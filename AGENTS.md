# Faunder UI — Agent Instructions

Use this file when building UI with **Faunder UI**. Put it at your project root as `AGENTS.md` (Cursor, Codex, and most coding agents read it automatically).

**Claude Code:** also add `CLAUDE.md` containing `@AGENTS.md`.

**Live docs & copyable examples:** https://ui.faunder.fi/  
Useful pages: [/button](https://ui.faunder.fi/button), [/field](https://ui.faunder.fi/field), [/dialog](https://ui.faunder.fi/dialog), [/auth](https://ui.faunder.fi/auth) (form blocks). When unsure about markup, open the relevant showcase and copy from the Code tab.

---

## What Faunder UI is

- **CSS-only** design system — no JavaScript runtime, no React/Vue components to import
- Styles via **HTML attributes** (`ui-button`, `ui-card`, …), not CSS class names
- Tokens are **space-separated** on one attribute: `ui-button="primary lg block"`
- Selectors use `:where()` (zero specificity) — easy to override
- Native HTML elements (buttons, inputs, links, lists, headings) look good **automatically**
- Opt out of styles with `ui-off`

**Source of truth:** this file + the CSS + [ui.faunder.fi](https://ui.faunder.fi/). Do **not** invent tokens, Tailwind utilities, or a parallel component library.

---

## Setup (consumer project)

1. Download the latest CSS from [ui.faunder.fi](https://ui.faunder.fi/) (or `/dist/faunder-ui@latest.css` on the docs host) into your project, typically `styles/` or `public/`. Keep the versioned filename from the download (e.g. `faunder-ui@x.y.z.css`).
2. Link it once in your HTML (or import in your bundler), using **your** downloaded filename:

```html
<link rel="stylesheet" href="/styles/faunder-ui@x.y.z.css">
```

3. Prefer a **versioned** filename. Do not edit the Faunder CSS file — put app/theme overrides in a separate stylesheet loaded after it.
4. Optional theming: override CSS variables (`--primary-*`, `--neutral-*`, etc.) in your own CSS. Do not fork the library file.

---

## Hard rules for agents

1. **Use attribute API only.** Correct: `ui-button="primary"`. Wrong: `class="ui-button primary"`, `class="btn btn-primary"`, Tailwind for layout Faunder already covers.
2. **Compose existing primitives.** Prefer `ui-container` + `ui-column`/`ui-row` + `ui-card` + `ui-field` + `ui-button`. Do not add new `ui-*` attributes or CSS components unless the user asks.
3. **Do not invent tokens.** If a token is not listed here, it does not exist (e.g. there is no `ui-button="secondary"` or `ui-button="danger"`).
4. **Always set gap on flex layouts.** `ui-row` / `ui-column` have **no default gap** — use `gap-md` (or another `gap-*`).
5. **Multiple modifiers = one attribute.** `ui-button="primary block sm"`, never separate attributes per token.
6. **Prefer semantic HTML.** Use real `<button>`, `<a>`, `<dialog>`, `<form>`, `<label>`, etc.
7. **Minimal custom CSS.** Only when Faunder cannot express the need. Prefer CSS variables for theme, not one-off class soups.
8. **Loading state:** `aria-busy="true"` on the button — not spinner markup or `.loading` classes.
9. **Unstyled lists:** `ui-off` on the `ul`/`ol` — not `class="unstyled"`.
10. **Ignore outdated docs** that mention class-based APIs (`heading xxl`, `container`, `modal`, `button-group`). Those are obsolete.

---

## Mental model

| Need | Use |
|------|-----|
| Page width | `ui-container` |
| Vertical stack | `ui-column="gap-…"` |
| Horizontal stack | `ui-row="gap-… y-center"` |
| Spacing | `ui-margin` / `ui-padding` |
| Surface / group | `ui-card` |
| Form control + label + errors | `ui-field` |
| Actions | `ui-button` (or bare `<button>`) |
| Text links | `ui-link` or bare `<a>` |
| Modal / drawer | `dialog` + `ui-dialog` |
| Dropdown menu | `ui-menu` + Popover API |
| Disable Faunder on one node | `ui-off` |

Typical page shell:

```html
<div ui-container>
  <div ui-column="gap-lg">
    <!-- sections -->
  </div>
</div>
```

---

## Attribute reference

### `ui-button`

Applies to `[ui-button]`, native `button`, and `input[type="button"|"submit"|"reset"]` (unless `ui-off` or `ui-link`).

| Kind | Tokens |
|------|--------|
| Variant | *(omit = default / secondary look)* \| `primary` \| `tertiary` \| `inline` |
| Size | `xs` \| `sm` \| *(default)* \| `lg` \| `xl` |
| Modifier | `wide` \| `block` \| `square` \| `circle` |

```html
<button ui-button="primary">Save</button>
<button>Cancel</button><!-- default = secondary look -->
<button ui-button="tertiary">Ghost</button>
<button ui-button="primary block">Full width</button>
<button ui-button="primary" aria-busy="true">Saving…</button>
<a href="/x" ui-button="primary">Link as button</a>
```

**Does not exist:** `secondary`, `danger`, `outline`, `ghost` (use `tertiary` for ghost).

Checkbox/radio as toggle buttons:

```html
<input type="checkbox" ui-button aria-label="Bold" />
```

---

### `ui-input`

Text-like `input`, `textarea`, and `select` are **auto-styled** without an attribute.

| Tokens | Meaning |
|--------|---------|
| `sm` \| `lg` | Control size (default = medium) |
| `switch` | Toggle look — **only** on `checkbox` / `radio` |

```html
<input type="email" placeholder="you@example.com" />
<input type="text" ui-input="sm" />
<input type="checkbox" ui-input="switch" />
<select ui-input="lg">…</select>
```

Invalid styling: `:user-invalid` or `aria-invalid="true"`.

---

### `ui-field`

Wrap label + control + messages. **No tokens.**

Required child order:

1. `label`
2. control (`input` / `textarea` / `select`)
3. hint: `p` (no `role`)
4. error: `p role="error"` — shown when field is invalid
5. optional: `p role="status"` — kept for markup consistency; **CSS does not auto-show it**

```html
<div ui-field>
  <label for="email">Email</label>
  <input type="email" id="email" name="email" required
    aria-describedby="email-hint" aria-errormessage="email-error" />
  <p id="email-hint">We'll never share your email.</p>
  <p id="email-error" role="error">Enter a valid email.</p>
</div>
```

---

### `ui-dialog`

Only on `<dialog ui-dialog>`.

| Kind | Tokens |
|------|--------|
| Size | `xs` (400px) \| `sm` (600) \| *(default 800)* \| `lg` (1200) \| `xl` (1600) |
| Position | *(omit = center)* \| `left` \| `right` \| `top` \| `bottom` |
| Extra | `edge` (flush) \| `allow-page-scroll` |

Direct children: optional `header`, content, optional `footer`. Add `ui-row` yourself on header/footer — there is no default flex.

```html
<button commandfor="dlg" command="show-modal" ui-button="primary">Open</button>

<dialog id="dlg" ui-dialog closedby="any">
  <header ui-row="gap-md x-between y-center">
    <h2 ui-heading="lg">Title</h2>
    <button ui-button="inline" ui-icon="x" commandfor="dlg" command="close" aria-label="Close"></button>
  </header>
  <p>Body copy.</p>
  <footer ui-row="gap-sm x-end y-center">
    <button ui-button commandfor="dlg" command="close">Cancel</button>
    <button ui-button="primary" commandfor="dlg" command="close">Confirm</button>
  </footer>
</dialog>
```

Drawer example: `ui-dialog="right sm edge"`.

---

### `ui-card`

| Tokens (tone) | |
|---------------|--|
| *(omit = white)* \| `neutral` \| `primary` \| `secondary` \| `error` \| `warning` \| `success` \| `info` |

Combine with `ui-shadow`. Clickable: put `ui-card` on `<a>`.

```html
<div ui-card="neutral" ui-shadow>
  <h3 ui-heading="lg">Title</h3>
  <p>Content</p>
</div>
```

---

### `ui-container`

| Tokens | Content max (approx.) |
|--------|------------------------|
| `xs` | 400px |
| `sm` | 600px |
| *(default)* | 900px |
| `lg` | 1200px |
| `xl` | 1600px |
| `full` | full width (padding only) |

---

### `ui-row` / `ui-column`

Flex layouts. **Always include a `gap-*`.**

**Shared gap tokens:** `gap-xs` `gap-sm` `gap-md` `gap-lg` `gap-xl` `gap-2xl` `gap-3xl` `gap-4xl` `gap-5xl` `gap-6xl`

**`ui-row`** (horizontal):

- Main axis (justify): `x-start` `x-end` `x-center` `x-between` `x-around` `x-evenly`
- Cross axis (align): `y-start` `y-end` `y-center` `y-stretch`
- Extra: `wrap` `inline`

**`ui-column`** (vertical):

- Cross axis (align-items): `x-start` `x-end` `x-center` `x-stretch`
- Main axis (justify): `y-start` `y-end` `y-center` `y-between` `y-around` `y-evenly` `y-stretch`

```html
<div ui-row="gap-sm y-center x-between">…</div>
<div ui-column="gap-md">…</div>
```

---

### `ui-margin` / `ui-padding`

Size scale (rem): `xs` 0.25 · `sm` 0.5 · `md` 1 · `lg` 1.5 · `xl` 2.5 · `2xl` 4 · `3xl` 6 · `4xl` 8 · `5xl` 12 · `6xl` 16

| Form | Example |
|------|---------|
| All sides | `ui-margin="md"` |
| Axis | `ui-padding="block-lg"` `ui-margin="inline-sm"` |
| Side | `ui-margin="top-lg"` `bottom-sm` `left-md` `right-md` |
| Combine | `ui-margin="top-lg bottom-sm"` |
| Margin only | `ui-margin="block-0"` |

---

### `ui-heading`

Auto on `h1`–`h6`. Optional size: `xs` `sm` *(default)* `lg` `xl` `xxl`.

```html
<h1 ui-heading="xxl">Page title</h1>
<h2 ui-heading="lg">Section</h2>
```

There is **no** `md` size token (writing `ui-heading="md"` is a no-op).

---

### `ui-link`

Auto on `<a>` (unless `ui-button` / `ui-card` / `ui-off`). Token: `inherit` (inherit color; hover still primary).

Putting `ui-link` on a `button` opts **out** of button chrome.

---

### `ui-shadow`

`xs` `sm` *(bare `ui-shadow` ≈ md)* `lg` `xl`. No `md` token — use bare `ui-shadow`.

---

### `ui-group`

Joins sibling controls into a segmented control. Token: `block` (full width).

```html
<div ui-group>
  <button ui-button>Left</button>
  <button ui-button="primary">Right</button>
</div>
```

---

### `ui-accordion`

Wraps `details`/`summary`. Token: `leading-icon` (caret before label; default caret is after).

```html
<section ui-accordion>
  <details>
    <summary>Section</summary>
    <p>Content</p>
  </details>
</section>
```

---

### `ui-menu`

Requires Popover + CSS Anchor Positioning.

```html
<div ui-menu>
  <button ui-button popovertarget="m1">Menu</button>
  <div id="m1" popover="auto" role="menu">
    <button type="button" role="menuitem">Item</button>
    <hr />
    <button type="button" role="menuitem">Other</button>
  </div>
</div>
```

Position tokens on `ui-menu`: `bottom-left` `bottom-right` `top` `top-left` `top-right` `left` `left-top` `left-bottom` `right` `right-top` `right-bottom` (default = bottom center).

---

### `ui-tooltip`

```html
<div ui-tooltip><!-- or bottom|left|right; default top -->
  <button ui-button aria-describedby="tip1">Hover me</button>
  <div id="tip1" role="tooltip">Help text</div>
</div>
```

Shows on hover when the device supports hover.

---

### `ui-icon`

Built-in names: `caret-down` `heart` `star` `plus` `x` `spinner` `download-simple`.

Sizes: `xs` `sm` *(default)* `lg` `xl` `2xl` … `6xl`.  
On buttons: `ui-icon="heart"` (leading) or `ui-icon="star trailing"`.

Custom icons: set `--ui-icon: url(...)` in CSS, or use inline SVG / emoji with `ui-icon` size tokens.

---

### `ui-code`

On `pre` wrapping `code`: token `scroll` for horizontal scroll instead of wrap. Inline `code` is auto-styled.

---

### `ui-off`

Disable Faunder styles on that element (and for lists: remove markers/padding).

---

## Colors (CSS variables)

Semantic scales with steps **50–950**:

- `--neutral-*`
- `--primary-*`
- `--secondary-*`
- `--error-*` `--warning-*` `--success-*` `--info-*`
- `--white` `--black`

Theme by overriding these in your own stylesheet after Faunder. Prefer semantic scales over raw `--tw-*` vars.

---

## Composition recipes (copy these patterns)

### Form (auth-style block)

No new CSS — only composition:

```html
<div ui-container="sm">
  <div ui-card="neutral">
    <h2 ui-heading="lg" ui-margin="block-lg">Sign in</h2>
    <form ui-column="gap-md" method="post" ui-margin="bottom-lg">
      <div ui-field>
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required
          aria-describedby="email-hint" aria-errormessage="email-error" />
        <p id="email-hint">We'll never share your email.</p>
        <p id="email-error" role="error">Enter a valid email.</p>
      </div>
      <div ui-field>
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required minlength="8"
          aria-describedby="password-hint" aria-errormessage="password-error" />
        <p id="password-hint">At least 8 characters.</p>
        <p id="password-error" role="error">Password must be at least 8 characters.</p>
      </div>
      <div ui-row="gap-sm y-center x-between">
        <label ui-row="gap-sm y-center">
          <input type="checkbox" name="remember" />
          <span>Remember me</span>
        </label>
        <a href="/forgot" ui-link>Forgot password?</a>
      </div>
      <button type="submit" ui-button="primary block">Sign in</button>
      <p><a href="/register" ui-link>Create an account</a></p>
    </form>
  </div>
</div>
```

### Settings section

```html
<div ui-container>
  <div ui-column="gap-xl">
    <header ui-column="gap-sm">
      <h1 ui-heading="xxl">Settings</h1>
      <p>Manage your account.</p>
    </header>
    <div ui-card="neutral" ui-column="gap-md">
      <h2 ui-heading="lg">Profile</h2>
      <!-- fields… -->
      <div ui-row="gap-sm x-end">
        <button type="button">Cancel</button>
        <button type="submit" ui-button="primary">Save</button>
      </div>
    </div>
  </div>
</div>
```

### Confirm dialog

```html
<dialog id="confirm" ui-dialog="sm" closedby="any">
  <header ui-row="x-between y-center gap-md">
    <h2 ui-heading="lg">Delete item?</h2>
    <button ui-button="inline" ui-icon="x" commandfor="confirm" command="close" aria-label="Close"></button>
  </header>
  <p>This cannot be undone.</p>
  <footer ui-row="gap-sm x-end">
    <button commandfor="confirm" command="close">Cancel</button>
    <button ui-button="primary" commandfor="confirm" command="close">Delete</button>
  </footer>
</dialog>
```

### Empty state

```html
<div ui-column="gap-md x-center" ui-padding="block-2xl">
  <h2 ui-heading="lg">Nothing here yet</h2>
  <p>Create your first item to get started.</p>
  <button ui-button="primary">Create</button>
</div>
```

---

## What NOT to do

| Wrong | Right |
|-------|-------|
| `class="ui-button primary"` | `ui-button="primary"` |
| `ui-button="secondary"` | bare `<button>` or `ui-button` with no variant |
| `ui-button="danger"` | default/primary + copy, or theme your own override |
| `class="container"` | `ui-container` |
| `class="card"` / `modal` | `ui-card` / `dialog ui-dialog` |
| `class="button-group"` | `ui-group` |
| `class="unstyled"` on lists | `ui-off` |
| `<span class="loading spinner">` | `aria-busy="true"` on the button |
| Tailwind `flex gap-4` for Faunder layouts | `ui-row="gap-md"` / `ui-column="gap-md"` |
| Editing `faunder-ui@….css` | separate theme/overrides stylesheet |
| New CSS for every page section | compose attributes first |

---

## Framework notes

Faunder is framework-agnostic. In React/Preact/Vue/Svelte:

- Render the same HTML attributes (`ui-button="primary"`).
- Do not wrap every primitive in a custom component unless you need behavior (state, routing). Thin wrappers are fine if they only forward attributes and children.
- For dialogs/menus, prefer native `<dialog>`, `popover`, and Invoker Commands (`command` / `commandfor`) when the browser target allows; otherwise wire `showModal()` / `popover` from your framework.

---

## Decision checklist (before writing UI)

1. Is there a Faunder attribute for this? → use it.
2. Can I compose Auth/Field/Dialog-style blocks? → compose, don’t invent CSS. Check https://ui.faunder.fi/auth etc. if needed.
3. Am I about to add Tailwind or a one-off class? → stop; check layout/spacing tokens first.
4. Am I inventing a token name? → check this file; if missing, don’t use it.
5. Theme/brand color? → override CSS variables, don’t fork the library.

---

## Quick cheat sheet

```
ui-button="primary|tertiary|inline  xs|sm|lg|xl  wide|block|square|circle"
ui-input="sm|lg|switch"
ui-field
ui-dialog="xs|sm|lg|xl  left|right|top|bottom  edge  allow-page-scroll"
ui-card="neutral|primary|secondary|error|warning|success|info"
ui-container="xs|sm|lg|xl|full"
ui-row="x-* y-* gap-* wrap|inline"
ui-column="x-* y-* gap-*"
ui-margin / ui-padding = size | {block|inline|top|right|bottom|left}-{size}
ui-heading="xs|sm|lg|xl|xxl"
ui-link="inherit"
ui-shadow="xs|sm|lg|xl"   (or bare ui-shadow)
ui-group="block"
ui-accordion="leading-icon"
ui-menu="…position…"
ui-tooltip="top|bottom|left|right"
ui-icon="caret-down|heart|star|plus|x|spinner|download-simple  trailing  xs…6xl"
ui-code="scroll"
ui-off
```

When unsure, prefer fewer attributes and semantic HTML over more CSS.
