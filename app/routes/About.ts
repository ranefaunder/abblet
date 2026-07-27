import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { appEditUrl, galleryUrl } from "/utils/app-url";
import { requireLogin } from "/app/stores/userStore";

export const AboutPath = "/:lang/about" as const;

export default function About(_props: RoutePropsForPath<typeof AboutPath>) {
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";

  const view = html`
    <div data-scope="About" class="about">
      <div class="scroll">
        <header class="top" ui-padding="inline-md block-md">
          <a
            href=${`/${lang}/`}
            ui-button="tertiary square sm"
            ui-icon="arrow-left"
            aria-label=${t("Back")}
          ></a>
        </header>

        <section class="hero">
          <div class="hero-inner" ui-container="sm" ui-column="gap-lg">
            <p class="brand">
              <img src="/static/rmix.svg" alt="Rmix" width="200" height="47" />
            </p>
            <h1 class="headline">${t("Apply it.")}</h1>
            <p class="lede">
              ${t("Describe what you need in plain language. Rmix builds your app in minutes — no code required.")}
            </p>
            <div class="cta" ui-row="gap-sm wrap y-center">
              <a
                href=${appEditUrl(lang)}
                ui-button="primary"
                onClick=${(e: Event) => {
                  if (requireLogin()) return;
                  e.preventDefault();
                }}
              >${t("Create an app")}</a>
              <a href=${galleryUrl(lang)} ui-button="tertiary">${t("Browse the Gallery")}</a>
            </div>
          </div>
        </section>

        <section class="section" ui-container="sm" ui-column="gap-md">
          <h2 ui-heading="lg">${t("What Rmix is")}</h2>
          <p class="body">
            ${t("Rmix is a place to make small personal apps for your own life — lists, trackers, tools, and little helpers that fit how you actually work.")}
          </p>
          <p class="body">
            ${t("You talk to Rmix like a person. It designs and builds a working app you can open on your phone and keep improving.")}
          </p>
        </section>

        <section class="section" ui-container="sm" ui-column="gap-lg">
          <h2 ui-heading="lg">${t("How it works")}</h2>
          <ol class="steps" ui-off>
            <li>
              <span class="step-num" aria-hidden="true">1</span>
              <div ui-column="gap-xs">
                <h3 ui-heading="sm">${t("Describe")}</h3>
                <p class="body">${t("Write what you need in everyday words — a shopping list, habit tracker, workout log, or something only you would invent.")}</p>
              </div>
            </li>
            <li>
              <span class="step-num" aria-hidden="true">2</span>
              <div ui-column="gap-xs">
                <h3 ui-heading="sm">${t("Rmix builds")}</h3>
                <p class="body">${t("In minutes you get a finished mini-app with its own look and icon — ready to open, not a mockup.")}</p>
              </div>
            </li>
            <li>
              <span class="step-num" aria-hidden="true">3</span>
              <div ui-column="gap-xs">
                <h3 ui-heading="sm">${t("Use and evolve")}</h3>
                <p class="body">${t("Ask for changes anytime. Publish to the Gallery if you want, or keep it private for yourself.")}</p>
              </div>
            </li>
          </ol>
        </section>

        <section class="section" ui-container="sm" ui-column="gap-md">
          <h2 ui-heading="lg">${t("Who it's for")}</h2>
          <p class="body">
            ${t("Rmix is for anyone who wants software that fits their life — without learning to code, waiting on a developer, or forcing a generic app to behave.")}
          </p>
        </section>

        <section class="closing" ui-container="sm" ui-column="gap-md">
          <h2 class="closing-title">${t("Start with one idea")}</h2>
          <p class="body">
            ${t("Your first app can be tiny. The important part is that it's yours.")}
          </p>
          <div class="cta">
            <a
              href=${appEditUrl(lang)}
              ui-button="primary"
              onClick=${(e: Event) => {
                if (requireLogin()) return;
                e.preventDefault();
              }}
            >${t("Create an app")}</a>
          </div>
        </section>

        <footer class="foot" ui-container="sm">
          <p class="foot-brand">Rmix</p>
        </footer>
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="About"]) to ([data-scope]) {
      &.about {
        --about-ink: #0f1419;
        --about-ink-2: #1c2430;
        --about-paper: #f4f1ea;
        --about-paper-dim: #c8c2b6;
        --about-glow: rgba(200, 170, 120, 0.22);
        --about-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
        --about-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;

        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        color: var(--about-paper);
        background: var(--about-ink);
        font-family: var(--about-sans);
      }

      .scroll {
        flex: 1;
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        position: relative;
        isolation: isolate;
      }

      .scroll::before {
        content: "";
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background-color: var(--about-ink);
        background-image:
          radial-gradient(ellipse 80% 55% at 85% 8%, var(--about-glow) 0%, transparent 55%),
          radial-gradient(ellipse 70% 50% at 10% 70%, rgba(90, 130, 160, 0.18) 0%, transparent 55%),
          linear-gradient(165deg, var(--about-ink) 0%, var(--about-ink-2) 55%, #151a22 100%);
        animation: about-glow 14s ease-in-out infinite alternate;
      }

      @keyframes about-glow {
        from { opacity: 0.85; }
        to { opacity: 1; }
      }

      .top,
      .hero,
      .section,
      .closing,
      .foot {
        position: relative;
        z-index: 1;
      }

      .top {
        padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
      }

      .top a[ui-button] {
        color: var(--about-paper);
        background: transparent;
      }

      .hero {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-height: min(88svh, 52rem);
        padding-block: 2rem 4rem;
        animation: about-rise 0.9s ease-out both;
      }

      .hero-inner {
        width: 100%;
        box-sizing: border-box;
      }

      @keyframes about-rise {
        from {
          opacity: 0;
          transform: translateY(18px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .brand {
        margin: 0;
        color: var(--about-paper);
      }

      .brand img {
        display: block;
        height: clamp(2.5rem, 10vw, 3.5rem);
        width: auto;
      }

      .headline {
        margin: 0;
        font-family: var(--about-display);
        font-size: clamp(1.75rem, 5.5vw, 2.35rem);
        font-weight: 600;
        letter-spacing: -0.02em;
        line-height: 1.15;
        color: var(--about-paper);
      }

      .lede,
      .body {
        margin: 0;
        max-width: 36rem;
        font-size: 1.0625rem;
        line-height: 1.55;
        color: var(--about-paper-dim);
      }

      .cta a[ui-button="primary"] {
        --_btn-bg: var(--about-paper);
        --_btn-fg: var(--about-ink);
      }

      .cta a[ui-button="tertiary"] {
        color: var(--about-paper);
      }

      .cta a[ui-button]:hover {
        transform: translateY(-1px);
        transition: transform 0.15s ease;
      }

      .section {
        padding-block: 3.5rem;
        border-top: 1px solid rgba(244, 241, 234, 0.08);
        animation: about-rise 0.8s ease-out both;
        animation-delay: 0.12s;
      }

      .section h2,
      .closing-title {
        margin: 0;
        font-family: var(--about-display);
        color: var(--about-paper);
      }

      .section h3 {
        margin: 0;
        color: var(--about-paper);
      }

      .steps {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 1.75rem;
      }

      .steps li {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
      }

      .step-num {
        flex: 0 0 auto;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 999px;
        display: grid;
        place-items: center;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: var(--about-ink);
        background: var(--about-paper);
        margin-top: 0.15rem;
      }

      .closing {
        padding-block: 3.5rem 2rem;
        border-top: 1px solid rgba(244, 241, 234, 0.08);
      }

      .closing-title {
        font-size: clamp(1.5rem, 4vw, 2rem);
        font-weight: 600;
        letter-spacing: -0.02em;
      }

      .foot {
        padding-block: 2rem calc(2rem + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid rgba(244, 241, 234, 0.08);
      }

      .foot-brand {
        margin: 0;
        font-family: var(--about-display);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.75rem;
        color: var(--about-paper-dim);
      }

      @media (min-width: 700px) {
        .hero {
          padding-block: 3rem 5rem;
        }

        .section,
        .closing {
          padding-block: 4.5rem;
        }
      }
    }
  `;

  return [view, style];
}
