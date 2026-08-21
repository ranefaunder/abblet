import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { appsAppUrl, appsUrl, createUrl } from "/utils/app-url";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter } from "/utils/app-preview";
import type { StoreAppCard } from "/types/app-types";
import { storeApps, loadStore } from "/app/stores/storeListingStore";
import { isLoggedIn, openLoginDialog, user, refreshSessionUser } from "/app/stores/userStore";
import { openPremiumDialog } from "/app/components/PremiumDialog";
import {
  FREE_GRANT_USD,
  PREMIUM_GRANT_USD,
  PREMIUM_PRICE_USD,
  formatUsdAmount,
} from "/utils/billing-plans";

export const AboutPath = "/:lang/about" as const;

function pickApps(apps: StoreAppCard[], count: number, offset = 0): StoreAppCard[] {
  if (apps.length === 0) return [];
  const out: StoreAppCard[] = [];
  for (let i = 0; i < count; i++) {
    out.push(apps[(offset + i) % apps.length]!);
  }
  return out;
}

function IconLink({
  app,
  lang,
  sizeRem,
  rotate = 0,
  className = "",
}: {
  app: StoreAppCard;
  lang: string;
  sizeRem: number;
  rotate?: number;
  className?: string;
}) {
  const iconSrc = appIconSrc(app.iconId);
  return html`
    <a
      class=${`icon-link ${className}`.trim()}
      href=${appsAppUrl(lang, app.slug)}
      aria-label=${app.title}
      title=${app.title}
      style=${`--icon-size: ${sizeRem}rem; --icon-rot: ${rotate}deg`}
    >
      <span class="icon-face" style=${`background: ${previewGradient(app.slug)}`} aria-hidden="true">
        ${iconSrc
          ? html`<img src=${iconSrc} alt="" width="96" height="96" decoding="async" />`
          : html`<span class="icon-letter">${draftLetter(app.title)}</span>`}
      </span>
    </a>
  `;
}

/** Intentional home-screen collage: 5 staggered columns beside the hero copy. */
const HERO_COLS = 5;
const HERO_ROWS = 3;

function HeroShelf({ apps, lang }: { apps: StoreAppCard[]; lang: string }) {
  if (apps.length === 0) return null;
  const cols = Array.from({ length: HERO_COLS }, (_, col) =>
    Array.from({ length: HERO_ROWS }, (_, row) => apps[(col + row * HERO_COLS) % apps.length]!),
  );
  return html`
    <div class="hero-shelf" aria-label=${t("Browse the Store")}>
      ${cols.map(
        (colApps, col) => html`
          <div class=${`shelf-col col-${col}`}>
            ${colApps.map(
              (app, row) => html`
                <div class="shelf-item" style=${`--d: ${(col + row) * 0.05}s`}>
                  <${IconLink} app=${app} lang=${lang} sizeRem=${1} rotate=${0} />
                </div>
              `,
            )}
          </div>
        `,
      )}
    </div>
  `;
}

function IconRiver({ apps, lang }: { apps: StoreAppCard[]; lang: string }) {
  if (apps.length === 0) return null;
  // Enough icons to fill wide viewports; identical twin group = seamless loop.
  const base = apps.length >= 12 ? apps : pickApps(apps, 12, 0);
  const segment = () =>
    base.map(
      (app, i) => html`
        <${IconLink}
          app=${app}
          lang=${lang}
          sizeRem=${2.75 + (i % 3) * 0.35}
          rotate=${0}
        />
      `,
    );

  return html`
    <div class="icon-river" aria-label=${t("Browse the Store")}>
      <div class="icon-river-track">
        <div class="icon-river-group">${segment()}</div>
        <div class="icon-river-group" aria-hidden="true">${segment()}</div>
      </div>
    </div>
  `;
}

export default function About(_props: RoutePropsForPath<typeof AboutPath>) {
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const apps = storeApps.value;
  const heroApps = pickApps(apps, HERO_COLS * HERO_ROWS, 0);
  const riverApps = pickApps(apps, Math.max(apps.length, 12), 2);
  const closingApps = pickApps(apps, 7, 1);
  const loggedIn = isLoggedIn();
  const plan = user.value?.plan === "premium" ? "premium" : "free";
  const onFree = loggedIn && plan === "free";
  const onPremium = loggedIn && plan === "premium";
  const creditMultiplier = Math.max(2, Math.round(PREMIUM_GRANT_USD / FREE_GRANT_USD));

  useEffect(() => {
    void loadStore({ q: "", category: null, excludeCategory: null });
    if (isLoggedIn()) void refreshSessionUser();
    const onPremium = () => {
      void refreshSessionUser();
    };
    window.addEventListener("premium-redeemed", onPremium);
    return () => window.removeEventListener("premium-redeemed", onPremium);
  }, []);

  function openRegister() {
    window.dispatchEvent(new CustomEvent("open-register-dialog"));
  }

  function onGetPremium() {
    if (!isLoggedIn()) {
      openLoginDialog();
      return;
    }
    openPremiumDialog();
  }

  function onTierKeyActivate(e: KeyboardEvent, action: () => void) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  }

  const view = html`
    <div data-scope="About">
      <section class="hero">
        <div class="hero-inner">
          <div class="hero-copy" ui-column="gap-lg x-start">
            <img
              class="hero-brand"
              src="/static/images/abblet.svg"
              alt="Abblet"
              width="280"
              height="59"
            />
            <h1 class="hero-title">${t("Remix any app, or make your own.")}</h1>
            <p class="hero-lede">
              ${t("An app store where every app is remixable.")}
            </p>
            <div class="cta" ui-row="gap-sm wrap y-center">
              <a href=${appsUrl(lang)} ui-button="primary">${t("Browse the Store")}</a>
              <a href=${createUrl(lang)} ui-button>
                ${t("Create an app")}
              </a>
            </div>
          </div>
          <${HeroShelf} apps=${heroApps} lang=${lang} />
        </div>
      </section>

      <section class="band">
        <div class="wrap">
          <h2 class="display">${t("Software that fits — because you shape it.")}</h2>
          <p class="lead">
            ${t("Abblet is an app store where apps are not fixed products. Start with an app someone has already made and adapt it to your needs with a prompt, or turn your own idea into a new app from scratch. Instead of settling for software that almost fits, make software that does.")}
          </p>
        </div>
      </section>

      <${IconRiver} apps=${riverApps} lang=${lang} />

      <section class="create-section">
        <div class="wrap">
          <div class="create-pitch">
            <div class="create-pitch-copy" ui-column="gap-md">
              <p class="create-eyebrow">${t("Make your own")}</p>
              <h2 class="create-title">${t("Make your own apps with AI")}</h2>
              <p class="create-lede">
                ${t("Describe what you need in plain language. Abblet builds a working app in minutes — then you improve it by chatting. No code needed.")}
              </p>
              <div class="create-cta">
                <a href=${createUrl(lang)} ui-button="primary">
                  ${t("Create an app")}
                </a>
              </div>
            </div>
            <div class="create-demo" aria-hidden="true">
              <div class="create-demo-stage">
                <div class="create-demo-msg user" style="--d: 0.05s">
                  <p>${t("A habit tracker for my morning routine")}</p>
                </div>
                <div class="create-demo-msg build" style="--d: 0.35s">
                  <div class="create-demo-build">
                    <span class="create-demo-dots" aria-hidden="true">
                      <i></i><i></i><i></i>
                    </span>
                    <span>${t("Building your app…")}</span>
                  </div>
                  <div class="create-demo-bars">
                    <span style="--w: 88%"></span>
                    <span style="--w: 64%"></span>
                    <span style="--w: 76%"></span>
                  </div>
                </div>
                <div class="create-demo-msg result" style="--d: 0.7s">
                  <div class="create-demo-app">
                    <span class="create-demo-app-icon" aria-hidden="true">H</span>
                    <div ui-column="gap-xs">
                      <strong>${t("Morning Habits")}</strong>
                      <small>${t("Ready to open")}</small>
                    </div>
                  </div>
                  <p class="create-demo-reply">
                    ${t("Done — open it, then ask for changes anytime.")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="band muted">
        <div class="wrap" ui-column="gap-xl">
          <div ui-column="gap-md">
            <h2 class="display">${t("Designed for discovery.")}</h2>
            <p class="lead">
              ${t("Explore apps others have published. Remix the ones that almost fit. Or invent something only you would think of.")}
            </p>
          </div>
          <div class="pillars">
            <div ui-column="gap-sm">
              <h3 class="pillar-title">${t("Discover")}</h3>
              <p class="body">${t("Browse the Store for apps that solve real everyday needs — then make them yours.")}</p>
            </div>
            <div ui-column="gap-sm">
              <h3 class="pillar-title">${t("Adapt")}</h3>
              <p class="body">${t("Change an existing app with a prompt. Keep what works. Rewrite what doesn’t.")}</p>
            </div>
            <div ui-column="gap-sm">
              <h3 class="pillar-title">${t("Create")}</h3>
              <p class="body">${t("Go from idea to a working app in minutes, then improve it by chatting.")}</p>
            </div>
          </div>
        </div>
      </section>

      <section class="band">
        <div class="wrap" ui-column="gap-xl">
          <h2 class="display">${t("How it works")}</h2>
          <ol class="steps" ui-off>
            <li>
              <span class="step-num" aria-hidden="true">1</span>
              <div ui-column="gap-xs">
                <h3 class="pillar-title">${t("Pick a path")}</h3>
                <p class="body">${t("Remix an app from the Store, or start from your own idea.")}</p>
              </div>
            </li>
            <li>
              <span class="step-num" aria-hidden="true">2</span>
              <div ui-column="gap-xs">
                <h3 class="pillar-title">${t("Shape it with a prompt")}</h3>
                <p class="body">${t("Say what you need in everyday words. Abblet builds and updates a real app — ready to open, not a mockup.")}</p>
              </div>
            </li>
            <li>
              <span class="step-num" aria-hidden="true">3</span>
              <div ui-column="gap-xs">
                <h3 class="pillar-title">${t("Use and evolve")}</h3>
                <p class="body">${t("Install it, live with it, ask for changes anytime. Keep it private or publish it back to the Store.")}</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section class="pricing" id="plans">
        <div class="pricing-inner">
          <header class="pricing-head">
            <p class="pricing-eyebrow">${t("Pricing")}</p>
            <h2 class="pricing-title">${t("Start free. Upgrade when ideas keep coming.")}</h2>
            <p class="pricing-lede">
              ${t("Remixing and using AI apps uses credit. Free tops up each month; Premium adds more — and unused credit stacks.")}
            </p>
          </header>

          <div class="tiers">
            <article
              class=${`tier tier-free${onFree ? " is-current" : ""}${!loggedIn ? " is-actionable" : ""}`}
              onClick=${!loggedIn ? openRegister : undefined}
              onKeyDown=${!loggedIn
                ? (e: KeyboardEvent) => onTierKeyActivate(e, openRegister)
                : undefined}
              role=${!loggedIn ? "button" : undefined}
              tabindex=${!loggedIn ? 0 : undefined}
              aria-label=${!loggedIn ? t("Register free") : undefined}
            >
              <div class="tier-head">
                <div class="tier-title-row">
                  <h3 class="tier-name">${t("Free")}</h3>
                  ${onFree ? html`<span class="tier-tag">${t("Your current plan")}</span>` : ""}
                </div>
                <p class="tier-price">
                  <span class="tier-amount">$0</span>
                  <span class="tier-per">/mo</span>
                </p>
                <p class="tier-lede">${t("Everything you need to try Abblet.")}</p>
              </div>

              <div class="tier-metric">
                <span class="tier-metric-value">${formatUsdAmount(FREE_GRANT_USD)}</span>
                <span class="tier-metric-label">${t("AI credit / month")}</span>
              </div>

              <ul class="tier-perks" ui-off>
                <li>
                  <i ui-icon="check" aria-hidden="true"></i>
                  <span>${t("Balance tops up to $amount each month — doesn’t stack.", {
                    amount: formatUsdAmount(FREE_GRANT_USD),
                  })}</span>
                </li>
                <li>
                  <i ui-icon="check" aria-hidden="true"></i>
                  <span>${t("Remix any app in the Store")}</span>
                </li>
                <li>
                  <i ui-icon="check" aria-hidden="true"></i>
                  <span>${t("Create your own apps with AI")}</span>
                </li>
              </ul>

              <div class="tier-cta">
                ${!loggedIn
                  ? html`
                    <span class="tier-cta-face" ui-button="block">${t("Register free")}</span>
                    <p class="tier-fine">${t("No card needed")}</p>`
                  : onFree
                    ? html`<p class="tier-state">${t("You're on Free")}</p>`
                    : html`<p class="tier-state is-muted">${t("Included with every account")}</p>`}
              </div>
            </article>

            <article
              class=${`tier tier-premium${onPremium ? " is-current" : ""}${!onPremium ? " is-actionable" : ""}`}
              onClick=${!onPremium ? onGetPremium : undefined}
              onKeyDown=${!onPremium
                ? (e: KeyboardEvent) => onTierKeyActivate(e, onGetPremium)
                : undefined}
              role=${!onPremium ? "button" : undefined}
              tabindex=${!onPremium ? 0 : undefined}
              aria-label=${!onPremium ? t("Get Premium") : undefined}
            >
              <div class="tier-head">
                <div class="tier-title-row">
                  <h3 class="tier-name">${t("Premium")}</h3>
                  <span class="tier-tag is-accent">
                    ${onPremium ? t("Your current plan") : t("Recommended")}
                  </span>
                </div>
                <p class="tier-price">
                  <span class="tier-amount">${formatUsdAmount(PREMIUM_PRICE_USD)}</span>
                  <span class="tier-per">/mo</span>
                </p>
                <p class="tier-lede">${t("Build at your own pace — credit doesn’t expire.")}</p>
              </div>

              <div class="tier-metric">
                <span class="tier-metric-value">${formatUsdAmount(PREMIUM_GRANT_USD)}</span>
                <span class="tier-metric-label">${t("AI credit / month")}</span>
                <span class="tier-metric-chip">
                  ${t("$times× more", { times: creditMultiplier })}
                </span>
              </div>

              <ul class="tier-perks" ui-off>
                <li>
                  <i ui-icon="check" aria-hidden="true"></i>
                  <span>${t("Adds $amount credit every month — unused stacks", {
                    amount: formatUsdAmount(PREMIUM_GRANT_USD),
                  })}</span>
                </li>
                <li>
                  <i ui-icon="check" aria-hidden="true"></i>
                  <span>${t("Everything in Free")}</span>
                </li>
                <li>
                  <i ui-icon="check" aria-hidden="true"></i>
                  <span>${t("Keep creating when Free runs out")}</span>
                </li>
              </ul>

              <div class="tier-cta">
                ${onPremium
                  ? html`<p class="tier-state">${t("You're on Premium")}</p>`
                  : html`
                    <span class="tier-cta-face" ui-button="primary block">${t("Get Premium")}</span>`}
              </div>
            </article>
          </div>

          <p class="pricing-foot">
            ${t("Prices in USD. Free tops up to $free. Premium adds $premium each month (stacks).", {
              free: formatUsdAmount(FREE_GRANT_USD),
              premium: formatUsdAmount(PREMIUM_GRANT_USD),
            })}
          </p>
        </div>
      </section>

      <section class="closing">
        <div class="closing-icons" ui-row="gap-md y-center x-center wrap">
          ${closingApps.map(
            (app, i) => html`
              <${IconLink}
                app=${app}
                lang=${lang}
                sizeRem=${2.4 + (i % 3) * 0.25}
                rotate=${0}
                className="closing-icon"
              />
            `,
          )}
        </div>
        <div class="wrap" ui-column="gap-lg x-center">
          <h2 class="closing-title">${t("Remix any app, or make your own.")}</h2>
          <div class="cta" ui-row="gap-sm wrap y-center x-center">
            <a href=${appsUrl(lang)} ui-button="primary">${t("Browse the Store")}</a>
            <a href=${createUrl(lang)} ui-button>
              ${t("Create an app")}
            </a>
          </div>
          <p class="foot">
            ${t("Abblet is made by")}
            ${" "}
            <a href="https://faunder.fi" target="_blank" rel="noopener noreferrer" ui-link>
              Faunder
            </a>
          </p>
        </div>
      </section>
    </div>
  `;

  const style = css`
    @scope ([data-scope="About"]) to ([data-scope]) {
      & {
        color: var(--neutral-900);
        padding-bottom: calc(2rem + env(safe-area-inset-bottom, 0px));
        overflow-x: clip;
      }

      .wrap {
        width: min(100% - 2rem, 48rem);
        margin-inline: auto;
      }

      .icon-link {
        display: block;
        width: var(--icon-size, 2.75rem);
        height: var(--icon-size, 2.75rem);
        border-radius: calc(var(--icon-size, 2.75rem) * 0.24);
        transform: rotate(var(--icon-rot, 0deg));
        transition:
          transform 0.22s ease,
          filter 0.22s ease;
        box-shadow:
          0 10px 28px rgba(15, 20, 25, 0.12),
          0 1px 0 rgba(255, 255, 255, 0.35) inset;
      }

      .icon-link:hover {
        transform: rotate(var(--icon-rot, 0deg)) scale(1.08) translateY(-2px);
        filter: brightness(1.04);
        z-index: 2;
      }

      .icon-face {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        border-radius: inherit;
        overflow: hidden;
        color: var(--white);
        font-weight: 700;
        font-size: calc(var(--icon-size, 2.75rem) * 0.38);
      }

      .icon-face img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .hero {
        position: relative;
        isolation: isolate;
        min-height: min(88svh, 44rem);
        display: flex;
        align-items: center;
        padding-block: 3.5rem 4rem;
        background:
          radial-gradient(ellipse 70% 50% at 50% -10%, var(--neutral-100), transparent 60%),
          var(--white);
        animation: about-rise 0.7s ease-out both;
        overflow: hidden;
      }

      .hero-inner {
        width: min(100% - 2rem, 48rem);
        margin-inline: auto;
        display: grid;
        gap: 2.5rem;
        align-items: center;
        justify-items: start;
      }

      .hero-copy {
        position: relative;
        z-index: 1;
        max-width: 34rem;
        width: 100%;
        text-align: start;
      }

      .hero-shelf {
        --shelf-gap: clamp(0.45rem, 1.6vw, 0.95rem);
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        justify-content: stretch;
        gap: var(--shelf-gap);
        padding: 0.5rem 0;
        width: 100%;
        mask-image: linear-gradient(
          to bottom,
          transparent 0%,
          #000 12%,
          #000 88%,
          transparent 100%
        );
      }

      .shelf-col {
        display: flex;
        flex-direction: column;
        gap: var(--shelf-gap);
        min-width: 0;
      }

      .shelf-col.col-1 {
        transform: translateY(12%);
      }

      .shelf-col.col-2 {
        transform: translateY(3%);
      }

      .shelf-col.col-3 {
        transform: translateY(14%);
      }

      .shelf-col.col-4 {
        transform: translateY(6%);
      }

      .shelf-item {
        width: 100%;
        animation: shelf-rise 0.65s ease-out both;
        animation-delay: var(--d, 0s);
      }

      .hero-shelf .icon-link {
        --icon-rot: 0deg;
        width: 100%;
        height: auto;
        aspect-ratio: 1;
        border-radius: 24%;
      }

      .hero-brand {
        display: block;
        height: clamp(2.75rem, 8vw, 4rem);
        width: auto;
        max-width: 100%;
        margin-inline: 0;
        align-self: flex-start;
        color: var(--neutral-950);
      }

      .hero-title {
        margin: 0;
        max-width: 14ch;
        font-size: clamp(2.5rem, 8vw, 4.5rem);
        font-weight: 700;
        letter-spacing: -0.045em;
        line-height: 1.02;
        color: var(--neutral-950);
        text-wrap: balance;
      }

      .hero-lede {
        margin: 0;
        max-width: 28rem;
        font-size: clamp(1.125rem, 2.4vw, 1.375rem);
        line-height: 1.4;
        color: var(--neutral-600);
      }

      .icon-river {
        border-block: 1px solid var(--neutral-200);
        background: var(--neutral-50);
        overflow: hidden;
        padding-block: 1.35rem;
      }

      .icon-river-track {
        display: flex;
        width: max-content;
        animation: river-scroll 48s linear infinite;
      }

      .icon-river-group {
        display: flex;
        align-items: center;
        gap: 1.1rem;
        padding-inline-end: 1.1rem;
        flex-shrink: 0;
      }

      .icon-river:hover .icon-river-track {
        animation-play-state: paused;
      }

      .band {
        padding-block: clamp(3.5rem, 8vw, 6rem);
        border-top: 1px solid var(--neutral-200);
      }

      .band.muted {
        background: var(--neutral-50);
      }

      .display {
        margin: 0 0 1.25rem;
        max-width: 18ch;
        font-size: clamp(2rem, 5.5vw, 3.25rem);
        font-weight: 700;
        letter-spacing: -0.04em;
        line-height: 1.05;
        color: var(--neutral-950);
        text-wrap: balance;
      }

      .lead {
        margin: 0;
        max-width: 40rem;
        font-size: clamp(1.0625rem, 2vw, 1.25rem);
        line-height: 1.55;
        color: var(--neutral-600);
      }

      .create-section {
        padding-block: clamp(2.5rem, 6vw, 4.5rem);
        border-top: 1px solid var(--neutral-200);
      }

      .create-pitch {
        position: relative;
        overflow: hidden;
        display: grid;
        gap: 1.75rem;
        align-items: center;
        border-radius: 1.35rem;
        border: 1px solid var(--neutral-200);
        background:
          radial-gradient(ellipse 80% 70% at 100% 0%, var(--neutral-100), transparent 55%),
          radial-gradient(ellipse 60% 50% at 0% 100%, color-mix(in oklab, var(--primary-100) 55%, transparent), transparent 50%),
          var(--white);
        padding: 2rem 1.25rem 1.9rem;
      }

      .create-pitch-copy {
        position: relative;
        z-index: 1;
        max-width: 24rem;
      }

      .create-eyebrow {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--neutral-500);
      }

      .create-title {
        margin: 0;
        max-width: 12ch;
        font-size: clamp(1.85rem, 5.5vw, 2.55rem);
        font-weight: 700;
        letter-spacing: -0.045em;
        line-height: 1.02;
        color: var(--neutral-950);
        text-wrap: balance;
      }

      .create-lede {
        margin: 0;
        color: var(--neutral-600);
        font-size: 1.05rem;
        line-height: 1.45;
        text-wrap: pretty;
      }

      .create-cta {
        display: flex;
      }

      .create-cta [ui-button] {
        min-width: 9.5rem;
      }

      .create-demo {
        display: none;
        position: relative;
        z-index: 1;
        justify-self: stretch;
        min-width: 0;
      }

      .create-demo-stage {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        padding: 1rem;
        border-radius: 1.15rem;
        background:
          linear-gradient(160deg, var(--neutral-100), var(--white) 45%, var(--neutral-50));
        border: 1px solid var(--neutral-200);
        box-shadow:
          0 18px 40px rgba(15, 20, 25, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.8);
        transform: rotate(1.25deg);
      }

      .create-demo-msg {
        animation: create-demo-in 0.55s ease-out both;
        animation-delay: var(--d, 0s);
      }

      .create-demo-msg.user {
        align-self: flex-end;
        max-width: 92%;
      }

      .create-demo-msg.user p {
        margin: 0;
        padding: 0.7rem 0.9rem;
        border-radius: 1.05rem 1.05rem 0.3rem 1.05rem;
        background: var(--neutral-950);
        color: var(--white);
        font-size: 0.8125rem;
        font-weight: 550;
        line-height: 1.35;
        box-shadow: 0 8px 18px rgba(15, 20, 25, 0.18);
      }

      .create-demo-msg.build,
      .create-demo-msg.result {
        align-self: stretch;
        max-width: 100%;
      }

      .create-demo-build {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        margin-bottom: 0.55rem;
        font-size: 0.75rem;
        font-weight: 650;
        letter-spacing: 0.02em;
        color: var(--neutral-600);
      }

      .create-demo-dots {
        display: inline-flex;
        gap: 0.22rem;
      }

      .create-demo-dots i {
        width: 0.35rem;
        height: 0.35rem;
        border-radius: 999px;
        background: var(--primary-500);
        animation: create-demo-dot 1.1s ease-in-out infinite;
      }

      .create-demo-dots i:nth-child(2) {
        animation-delay: 0.15s;
      }

      .create-demo-dots i:nth-child(3) {
        animation-delay: 0.3s;
      }

      .create-demo-bars {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.75rem;
        border-radius: 0.95rem;
        background: color-mix(in oklab, var(--white) 70%, var(--neutral-50));
        border: 1px solid var(--neutral-200);
      }

      .create-demo-bars span {
        display: block;
        height: 0.4rem;
        width: var(--w, 70%);
        border-radius: 999px;
        background: linear-gradient(
          90deg,
          var(--neutral-200),
          var(--primary-200),
          var(--neutral-200)
        );
        background-size: 200% 100%;
        animation: create-demo-shimmer 1.6s linear infinite;
      }

      .create-demo-msg.result {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }

      .create-demo-app {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.7rem 0.8rem;
        border-radius: 1rem;
        background: var(--white);
        border: 1px solid var(--neutral-200);
        box-shadow: 0 10px 24px rgba(15, 20, 25, 0.08);
      }

      .create-demo-app-icon {
        flex: none;
        width: 2.6rem;
        height: 2.6rem;
        border-radius: 0.7rem;
        display: grid;
        place-items: center;
        font-weight: 700;
        font-size: 1.05rem;
        color: var(--white);
        background: linear-gradient(145deg, var(--primary-500), var(--primary-700));
        box-shadow: 0 6px 14px color-mix(in oklab, var(--primary-600) 35%, transparent);
      }

      .create-demo-app strong {
        font-size: 0.875rem;
        letter-spacing: -0.02em;
        color: var(--neutral-950);
      }

      .create-demo-app small {
        font-size: 0.75rem;
        color: var(--success-700, var(--primary-700));
        font-weight: 600;
      }

      .create-demo-reply {
        margin: 0;
        padding: 0.65rem 0.85rem;
        border-radius: 0.3rem 1.05rem 1.05rem 1.05rem;
        background: var(--white);
        border: 1px solid var(--neutral-200);
        font-size: 0.8125rem;
        line-height: 1.4;
        color: var(--neutral-700);
      }

      @keyframes create-demo-in {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes create-demo-dot {
        0%,
        80%,
        100% {
          opacity: 0.35;
          transform: translateY(0);
        }
        40% {
          opacity: 1;
          transform: translateY(-2px);
        }
      }

      @keyframes create-demo-shimmer {
        from {
          background-position: 100% 0;
        }
        to {
          background-position: -100% 0;
        }
      }

      .body {
        margin: 0;
        max-width: 34rem;
        font-size: 1.0625rem;
        line-height: 1.55;
        color: var(--neutral-600);
      }

      .pillars {
        display: grid;
        gap: 2rem;
      }

      .pillar-title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--neutral-950);
      }

      .steps {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }

      .steps li {
        display: flex;
        gap: 1.15rem;
        align-items: flex-start;
      }

      .step-num {
        flex: none;
        width: 2rem;
        height: 2rem;
        border-radius: 999px;
        display: grid;
        place-items: center;
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--white);
        background: var(--neutral-950);
        margin-top: 0.1rem;
      }

      .pricing {
        position: relative;
        overflow: hidden;
        padding-block: clamp(4.5rem, 10vw, 7.5rem);
        border-top: 1px solid var(--neutral-200);
        background:
          radial-gradient(ellipse 70% 55% at 78% 8%, color-mix(in oklab, var(--primary-100) 70%, transparent), transparent 60%),
          radial-gradient(ellipse 60% 50% at 8% 100%, var(--neutral-100), transparent 55%),
          var(--neutral-50);
      }

      .pricing-inner {
        position: relative;
        z-index: 1;
        width: min(100% - 2rem, 46rem);
        margin-inline: auto;
        display: flex;
        flex-direction: column;
        gap: clamp(2.25rem, 5vw, 3.25rem);
      }

      .pricing-head {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        text-align: center;
      }

      .pricing-eyebrow {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--primary-600);
      }

      .pricing-title {
        margin: 0;
        max-width: 20ch;
        font-size: clamp(2.1rem, 5.6vw, 3.15rem);
        font-weight: 750;
        letter-spacing: -0.045em;
        line-height: 1.03;
        color: var(--neutral-950);
        text-wrap: balance;
      }

      .pricing-lede {
        margin: 0;
        max-width: 30rem;
        font-size: clamp(1.0625rem, 2vw, 1.2rem);
        line-height: 1.5;
        color: var(--neutral-600);
        text-wrap: pretty;
      }

      .tiers {
        display: grid;
        gap: 1rem;
        align-items: stretch;
      }

      .tier {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 1.35rem;
        padding: 1.75rem 1.6rem 1.6rem;
        border-radius: 1.5rem;
        border: 1px solid var(--neutral-200);
        background: var(--white);
        transition: transform 220ms ease, box-shadow 220ms ease;
      }

      .tier:hover {
        transform: translateY(-3px);
      }

      .tier.is-actionable {
        cursor: pointer;
      }

      .tier.is-actionable:focus-visible {
        outline: 2px solid var(--primary-500);
        outline-offset: 3px;
      }

      .tier-free {
        box-shadow: 0 1px 2px rgba(15, 20, 25, 0.04);
      }

      .tier-premium {
        border-color: transparent;
        color: var(--white);
        background:
          radial-gradient(ellipse 90% 60% at 85% 0%, color-mix(in oklab, var(--primary-600) 55%, transparent), transparent 62%),
          linear-gradient(168deg, var(--neutral-900), var(--neutral-950) 55%);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.14) inset,
          0 24px 60px -18px rgba(15, 20, 25, 0.45),
          0 4px 14px -6px rgba(15, 20, 25, 0.28);
      }

      .tier-premium:hover {
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.18) inset,
          0 32px 70px -18px rgba(15, 20, 25, 0.5),
          0 6px 18px -6px rgba(15, 20, 25, 0.3);
      }

      .tier-head {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .tier-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        min-height: 1.6rem;
      }

      .tier-name {
        margin: 0;
        font-size: 1.0625rem;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: inherit;
      }

      .tier-free .tier-name {
        color: var(--neutral-950);
      }

      .tier-tag {
        flex: none;
        padding: 0.3rem 0.6rem;
        border-radius: 999px;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--neutral-600);
        background: var(--neutral-100);
      }

      .tier-tag.is-accent {
        color: var(--white);
        background: color-mix(in oklab, var(--primary-500) 88%, var(--white));
        box-shadow: 0 6px 18px -8px color-mix(in oklab, var(--primary-500) 90%, transparent);
      }

      .tier-price {
        margin: 0.1rem 0 0;
        display: flex;
        align-items: baseline;
        gap: 0.2rem;
        line-height: 0.9;
      }

      .tier-amount {
        font-size: clamp(2.85rem, 7.5vw, 3.5rem);
        font-weight: 800;
        letter-spacing: -0.055em;
        font-variant-numeric: tabular-nums;
        color: inherit;
      }

      .tier-free .tier-amount {
        color: var(--neutral-950);
      }

      .tier-per {
        font-size: 1rem;
        font-weight: 600;
        color: var(--neutral-500);
      }

      .tier-premium .tier-per {
        color: rgba(255, 255, 255, 0.6);
      }

      .tier-lede {
        margin: 0.2rem 0 0;
        font-size: 0.9375rem;
        line-height: 1.45;
        color: var(--neutral-600);
        text-wrap: pretty;
      }

      .tier-premium .tier-lede {
        color: rgba(255, 255, 255, 0.72);
      }

      .tier-metric {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.3rem 0.55rem;
        padding: 1rem 1.1rem;
        border-radius: 1.1rem;
        border: 1px solid var(--neutral-200);
        background: var(--neutral-50);
      }

      .tier-premium .tier-metric {
        border-color: rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.07);
      }

      .tier-metric-value {
        font-size: 1.5rem;
        font-weight: 750;
        letter-spacing: -0.035em;
        font-variant-numeric: tabular-nums;
        color: var(--neutral-950);
      }

      .tier-premium .tier-metric-value {
        color: var(--white);
      }

      .tier-metric-label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--neutral-500);
      }

      .tier-premium .tier-metric-label {
        color: rgba(255, 255, 255, 0.62);
      }

      .tier-metric-chip {
        margin-left: auto;
        padding: 0.25rem 0.55rem;
        border-radius: 999px;
        font-size: 0.6875rem;
        font-weight: 750;
        letter-spacing: 0.02em;
        white-space: nowrap;
        color: var(--white);
        background: color-mix(in oklab, var(--primary-500) 85%, var(--white));
      }

      .tier-perks {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        flex: 1;
      }

      .tier-perks li {
        display: flex;
        align-items: flex-start;
        gap: 0.6rem;
        font-size: 0.9375rem;
        line-height: 1.4;
        color: var(--neutral-700);
      }

      .tier-premium .tier-perks li {
        color: rgba(255, 255, 255, 0.86);
      }

      .tier-perks li [ui-icon] {
        flex: none;
        width: 1.05rem;
        height: 1.05rem;
        margin-top: 0.15rem;
        background: var(--primary-600);
      }

      .tier-premium .tier-perks li [ui-icon] {
        background: var(--primary-300);
      }

      .tier-cta {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }

      .tier-cta [ui-button] {
        width: 100%;
        box-sizing: border-box;
        text-align: center;
      }

      .tier-cta-face {
        pointer-events: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .tier-premium .tier-cta [ui-button] {
        border-color: var(--white);
        background: linear-gradient(to bottom, var(--white), var(--neutral-100));
        color: var(--neutral-950);
        font-weight: 700;
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.8) inset,
          0 10px 24px -10px rgba(0, 0, 0, 0.55);
      }

      .tier-premium.is-actionable:hover .tier-cta [ui-button],
      .tier-premium .tier-cta [ui-button]:hover {
        background: linear-gradient(to bottom, var(--white), var(--white));
      }

      .tier-fine {
        margin: 0;
        text-align: center;
        font-size: 0.8125rem;
        color: var(--neutral-500);
      }

      .tier-premium .tier-fine {
        color: rgba(255, 255, 255, 0.6);
      }

      .tier-state {
        margin: 0;
        padding: 0.7rem 0.5rem;
        border-radius: 0.85rem;
        text-align: center;
        font-size: 0.9rem;
        font-weight: 650;
        color: var(--neutral-800);
        background: var(--neutral-50);
        border: 1px solid var(--neutral-200);
      }

      .tier-premium .tier-state {
        color: var(--white);
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.16);
      }

      .tier-state.is-muted {
        font-weight: 500;
        color: var(--neutral-500);
        background: transparent;
        border-color: transparent;
      }

      .pricing-foot {
        margin: 0;
        text-align: center;
        font-size: 0.8125rem;
        color: var(--neutral-500);
      }

      @media (min-width: 640px) {
        .tiers {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.06fr);
          gap: 1.25rem;
          align-items: center;
        }

        .tier-free {
          margin-block: 0.9rem;
        }

        .tier-premium {
          padding: 2.15rem 1.85rem 1.85rem;
        }
      }

      @media (max-width: 639px) {
        .tier-premium {
          order: -1;
        }
      }

      .closing {
        position: relative;
        padding-block: clamp(3.5rem, 9vw, 6.5rem);
        border-top: 1px solid var(--neutral-200);
        background: var(--neutral-950);
        color: var(--white);
        text-align: center;
      }

      .closing-icons {
        margin-bottom: 2rem;
        padding-inline: 1rem;
      }

      .closing-icon {
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
      }

      .closing-title {
        margin: 0;
        max-width: 18ch;
        font-size: clamp(1.75rem, 4.5vw, 2.75rem);
        font-weight: 700;
        letter-spacing: -0.035em;
        line-height: 1.1;
        text-wrap: balance;
      }

      .closing .cta a[ui-button="primary"] {
        --_btn-bg: var(--white);
        --_btn-fg: var(--neutral-950);
      }

      .foot {
        margin: 0;
        font-size: 0.875rem;
        color: rgba(255, 255, 255, 0.55);
      }

      .foot a {
        color: rgba(255, 255, 255, 0.85);
      }

      @keyframes about-rise {
        from {
          opacity: 0;
          transform: translateY(16px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes shelf-rise {
        from {
          opacity: 0;
          transform: translateY(14px) scale(0.94);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes river-scroll {
        from {
          transform: translateX(0);
        }
        to {
          transform: translateX(-50%);
        }
      }

      @media (min-width: 640px) {
        .create-pitch {
          grid-template-columns: minmax(0, 1.15fr) minmax(11rem, 0.85fr);
          gap: 2rem;
          padding: 2.5rem 1.75rem 2.35rem;
        }

        .create-title {
          font-size: 2.55rem;
        }

        .create-lede {
          font-size: 1.1rem;
        }

        .create-demo {
          display: block;
        }

        .create-demo-stage {
          transform: rotate(2deg);
        }
      }

      @media (max-width: 899px) {
        .hero-shelf {
          order: 2;
        }
      }

      @media (min-width: 900px) {
        .hero-inner {
          grid-template-columns: minmax(0, 1fr) minmax(22rem, 1.15fr);
          gap: 2.5rem;
          align-items: center;
        }

        .hero {
          padding-block: 5rem 6rem;
        }

        .pillars {
          grid-template-columns: repeat(3, 1fr);
          gap: 2.5rem;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .hero-copy,
        .hero,
        .shelf-item,
        .create-demo-msg,
        .create-demo-dots i,
        .create-demo-bars span,
        .icon-river-track {
          animation: none;
        }

        .tier,
        .tier:hover {
          transition: none;
          transform: none;
        }

        .icon-link,
        .icon-link:hover {
          transition: none;
          transform: rotate(var(--icon-rot, 0deg));
        }
      }
    }
  `;

  return [view, style];
}
