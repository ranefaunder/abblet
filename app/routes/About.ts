import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { appEditUrl, storeAppUrl, storeUrl } from "/utils/app-url";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter } from "/utils/app-preview";
import type { StoreAppCard } from "/types/app-types";
import { storeApps, loadStore } from "/app/stores/storeListingStore";
import { requireLogin } from "/app/stores/userStore";

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
      href=${storeAppUrl(lang, app.slug)}
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

  useEffect(() => {
    void loadStore({ q: "", category: null });
  }, []);

  function onCreateClick(e: Event) {
    if (requireLogin()) return;
    e.preventDefault();
  }

  const view = html`
    <div data-scope="About">
      <section class="hero">
        <div class="hero-inner">
          <div class="hero-copy" ui-column="gap-lg x-start">
            <img
              class="hero-brand"
              src="/static/rmix.svg"
              alt="R⫶⫶MIX"
              width="280"
              height="66"
            />
            <h1 class="hero-title">${t("Remix any app, or make your own.")}</h1>
            <p class="hero-lede">
              ${t("An app store where every app is remixable to fit you.")}
            </p>
            <div class="cta" ui-row="gap-sm wrap y-center">
              <a href=${storeUrl(lang)} ui-button="primary">${t("Browse the Store")}</a>
              <a href=${appEditUrl(lang)} ui-button onClick=${onCreateClick}>
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
            ${t("R⫶⫶MIX is an app store where apps are not fixed products. Start with an app someone has already made and adapt it to your needs with a prompt, or turn your own idea into a new app from scratch. Instead of settling for software that almost fits, make software that does.")}
          </p>
        </div>
      </section>

      <${IconRiver} apps=${riverApps} lang=${lang} />

      <section class="split">
        <div class="wrap split-grid">
          <article ui-column="gap-md">
            <p class="eyebrow">${t("Remix")}</p>
            <h2 class="block-title">${t("Start with an app someone already made.")}</h2>
            <p class="body">
              ${t("Open anything in the Store, then adapt it with a prompt until it matches how you actually work — lists, trackers, tools, and helpers that fit your life.")}
            </p>
            <a href=${storeUrl(lang)} ui-button="primary sm">${t("Browse the Store")}</a>
          </article>
          <article ui-column="gap-md">
            <p class="eyebrow">${t("Make your own")}</p>
            <h2 class="block-title">${t("Turn your idea into a new app from scratch.")}</h2>
            <p class="body">
              ${t("Describe what you need in plain language. R⫶⫶MIX builds a working app you can open, install, and keep improving — no code required.")}
            </p>
            <a href=${appEditUrl(lang)} ui-button="primary sm" onClick=${onCreateClick}>
              ${t("Create an app")}
            </a>
          </article>
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
                <p class="body">${t("Say what you need in everyday words. R⫶⫶MIX builds and updates a real app — ready to open, not a mockup.")}</p>
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
            <a href=${storeUrl(lang)} ui-button="primary">${t("Browse the Store")}</a>
            <a href=${appEditUrl(lang)} ui-button onClick=${onCreateClick}>
              ${t("Create an app")}
            </a>
          </div>
          <p class="foot">
            ${t("R⫶⫶MIX is made by")}
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
        background: var(--white);
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

      .split {
        padding-block: clamp(3.5rem, 8vw, 6rem);
        border-top: 1px solid var(--neutral-200);
      }

      .split-grid {
        display: grid;
        gap: 2.5rem;
      }

      .eyebrow {
        margin: 0;
        font-size: 0.8125rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--neutral-500);
      }

      .block-title {
        margin: 0;
        font-size: clamp(1.5rem, 3.5vw, 2rem);
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1.15;
        color: var(--neutral-950);
        text-wrap: balance;
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

        .split-grid {
          grid-template-columns: 1fr 1fr;
          gap: 3.5rem;
        }

        .pillars {
          grid-template-columns: repeat(3, 1fr);
          gap: 2.5rem;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .hero,
        .shelf-item,
        .icon-river-track {
          animation: none;
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
