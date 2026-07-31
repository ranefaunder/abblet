import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect } from "preact/hooks";
import { t } from "/utils/i18n";
import { appsAppUrl, appsUrl } from "/utils/app-url";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter } from "/utils/app-preview";
import type { StoreAppCard } from "/types/app-types";
import { storeApps, loadStore } from "/app/stores/storeListingStore";

export const SplashPath = "/:lang" as const;

function pickApps(apps: StoreAppCard[], count: number, offset = 0): StoreAppCard[] {
  if (apps.length === 0) return [];
  return Array.from({ length: count }, (_, i) => apps[(offset + i) % apps.length]!);
}

function IconLink({
  app,
  lang,
  sizeRem,
  delay,
}: {
  app: StoreAppCard;
  lang: string;
  sizeRem: number;
  delay: number;
}) {
  const iconSrc = appIconSrc(app.iconId);
  return html`
    <a
      class="icon-link"
      href=${appsAppUrl(lang, app.slug)}
      aria-label=${app.title}
      title=${app.title}
      style=${`--icon-size: ${sizeRem}rem; --bob-delay: ${delay}s`}
    >
      <span class="icon-face" style=${`background: ${previewGradient(app.slug)}`} aria-hidden="true">
        ${iconSrc
          ? html`<img src=${iconSrc} alt="" width="96" height="96" decoding="async" />`
          : html`<span class="icon-letter">${draftLetter(app.title)}</span>`}
      </span>
    </a>
  `;
}

function IconRiver({ apps, lang }: { apps: StoreAppCard[]; lang: string }) {
  if (apps.length === 0) return null;
  const base = apps.length >= 12 ? apps : pickApps(apps, 12, 0);
  const segment = () =>
    base.map(
      (app, i) => html`
        <${IconLink}
          app=${app}
          lang=${lang}
          sizeRem=${2.55 + (i % 3) * 0.35}
          delay=${(i % 6) * 0.35}
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

export default function Splash({ params }: RoutePropsForPath<typeof SplashPath>) {
  const { lang } = params;
  const riverApps = pickApps(storeApps.value, Math.max(storeApps.value.length, 12), 0);

  useEffect(() => {
    void loadStore({ q: "", category: null, excludeCategory: null });
  }, []);

  const view = html`
    <div data-scope="Splash">
      <div class="ambiance" aria-hidden="true">
        <span class="orb orb-a"></span>
        <span class="orb orb-b"></span>
        <span class="orb orb-c"></span>
        <span class="shine"></span>
      </div>
      <div class="splash-shell" ui-column="gap-0 x-stretch y-center">
        <div class="splash" ui-column="gap-xl x-center y-center">
          <div class="brand-block" ui-column="gap-md x-center">
            <img
              class="wordmark"
              src="/static/images/remiix.svg"
              alt="Remiix"
              width="280"
              height="58"
            />
            <h1 class="slogan">${t("Remix any app to fit you.")}</h1>
            <p class="pitch">
              ${t("An app store where you can ask Remiix to change any app to fit your needs. If it doesn't exist, you can ask Remiix to make a new one from your own idea.")}
            </p>
          </div>
          <div class="cta">
            <a href=${appsUrl(lang)} ui-button="primary lg">${t("Browse the Store")}</a>
          </div>
        </div>
        <${IconRiver} apps=${riverApps} lang=${lang} />
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="Splash"]) to ([data-scope]) {
      & {
        --splash-rise: 720ms cubic-bezier(0.16, 1, 0.3, 1);
        position: relative;
        isolation: isolate;
        flex: 1;
        display: flex;
        min-height: 100dvh;
        min-height: var(--visual-viewport-height, 100dvh);
        overflow: hidden;
        background:
          radial-gradient(100% 70% at 50% -5%, color-mix(in oklab, var(--primary-100) 80%, transparent), transparent 58%),
          linear-gradient(180deg, var(--white) 0%, var(--neutral-50) 55%, color-mix(in oklab, var(--primary-50) 55%, var(--neutral-50)) 100%);
      }

      .ambiance {
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        overflow: hidden;
      }

      .orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(48px);
        will-change: transform;
      }

      .orb-a {
        width: min(55vw, 22rem);
        height: min(55vw, 22rem);
        top: -8%;
        left: -12%;
        background: color-mix(in oklab, var(--primary-300) 45%, transparent);
        animation: orb-drift-a 14s ease-in-out infinite alternate;
      }

      .orb-b {
        width: min(50vw, 18rem);
        height: min(50vw, 18rem);
        right: -10%;
        top: 28%;
        background: color-mix(in oklab, var(--secondary-300) 38%, transparent);
        animation: orb-drift-b 18s ease-in-out infinite alternate;
      }

      .orb-c {
        width: min(60vw, 24rem);
        height: min(60vw, 24rem);
        left: 20%;
        bottom: -18%;
        background: color-mix(in oklab, var(--primary-200) 40%, transparent);
        animation: orb-drift-c 16s ease-in-out infinite alternate;
      }

      .shine {
        position: absolute;
        inset: -20% -40%;
        background: linear-gradient(
          115deg,
          transparent 35%,
          color-mix(in oklab, var(--white) 55%, transparent) 48%,
          transparent 62%
        );
        animation: shine-sweep 9s ease-in-out infinite;
        opacity: 0.55;
      }

      .splash-shell {
        position: relative;
        z-index: 1;
        flex: 1;
        width: 100%;
        min-height: 0;
      }

      .icon-river {
        width: 100%;
        overflow: hidden;
        padding-top: 1rem;
        padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
        flex: none;
        animation: rise-in var(--splash-rise) both;
        animation-delay: 420ms;
        mask-image: linear-gradient(
          to right,
          transparent 0%,
          #000 10%,
          #000 90%,
          transparent 100%
        );
      }

      .icon-river-track {
        display: flex;
        width: max-content;
        animation: river-scroll 42s linear infinite;
      }

      .icon-river-group {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding-inline-end: 1rem;
        flex-shrink: 0;
      }

      .icon-river:hover .icon-river-track {
        animation-play-state: paused;
      }

      .icon-link {
        display: block;
        width: var(--icon-size, 2.6rem);
        height: var(--icon-size, 2.6rem);
        border-radius: calc(var(--icon-size, 2.6rem) * 0.24);
        text-decoration: none;
        flex: none;
        animation: icon-bob 4.8s ease-in-out infinite;
        animation-delay: var(--bob-delay, 0s);
        transition: transform 0.2s ease, filter 0.2s ease;
        box-shadow:
          0 12px 28px rgba(15, 20, 25, 0.14),
          0 1px 0 rgba(255, 255, 255, 0.4) inset;
      }

      .icon-link:hover {
        animation-play-state: paused;
        transform: scale(1.1) translateY(-3px);
        filter: brightness(1.05);
        z-index: 1;
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
        font-size: calc(var(--icon-size, 2.6rem) * 0.38);
      }

      .icon-face img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .splash {
        flex: 1;
        width: 100%;
        max-width: 30rem;
        margin-inline: auto;
        padding:
          calc(1.5rem + env(safe-area-inset-top, 0px))
          1.25rem
          1.25rem;
        box-sizing: border-box;
        text-align: center;
        min-height: 0;
      }

      .wordmark {
        display: block;
        height: clamp(2.4rem, 8vw, 3.35rem);
        width: auto;
        animation: wordmark-in 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .slogan {
        margin: 0;
        max-width: 12ch;
        font-size: clamp(1.85rem, 7vw, 2.65rem);
        font-weight: 700;
        letter-spacing: -0.045em;
        line-height: 1.08;
        color: var(--neutral-950);
        text-wrap: balance;
        animation: rise-in var(--splash-rise) both;
        animation-delay: 120ms;
      }

      .pitch {
        margin: 0;
        max-width: 40ch;
        font-size: 1.05rem;
        line-height: 1.45;
        color: var(--neutral-600);
        text-wrap: balance;
        animation: rise-in var(--splash-rise) both;
        animation-delay: 220ms;
      }

      .cta {
        animation: rise-in var(--splash-rise) both;
        animation-delay: 320ms;
      }

      .cta a {
        min-width: 11rem;
        box-shadow: 0 10px 28px color-mix(in oklab, var(--primary-500) 28%, transparent);
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease;
      }

      .cta a:hover {
        transform: translateY(-2px);
        box-shadow: 0 14px 34px color-mix(in oklab, var(--primary-500) 34%, transparent);
      }

      @keyframes wordmark-in {
        from {
          opacity: 0;
          transform: translateY(18px) scale(0.92);
          filter: blur(4px);
        }
        to {
          opacity: 1;
          transform: none;
          filter: none;
        }
      }

      @keyframes rise-in {
        from {
          opacity: 0;
          transform: translateY(14px);
        }
        to {
          opacity: 1;
          transform: none;
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

      @keyframes icon-bob {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-0.28rem);
        }
      }

      @keyframes orb-drift-a {
        from {
          transform: translate(0, 0) scale(1);
        }
        to {
          transform: translate(12%, 18%) scale(1.12);
        }
      }

      @keyframes orb-drift-b {
        from {
          transform: translate(0, 0) scale(1);
        }
        to {
          transform: translate(-14%, 10%) scale(1.08);
        }
      }

      @keyframes orb-drift-c {
        from {
          transform: translate(0, 0) scale(1);
        }
        to {
          transform: translate(8%, -12%) scale(1.15);
        }
      }

      @keyframes shine-sweep {
        0%,
        55% {
          transform: translateX(-30%) rotate(8deg);
          opacity: 0;
        }
        65% {
          opacity: 0.5;
        }
        80%,
        100% {
          transform: translateX(30%) rotate(8deg);
          opacity: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .orb,
        .shine,
        .wordmark,
        .slogan,
        .pitch,
        .cta,
        .icon-river,
        .icon-river-track,
        .icon-link {
          animation: none !important;
        }

        .icon-link:hover,
        .cta a:hover {
          transform: none;
        }
      }
    }
  `;

  return [view, style];
}
