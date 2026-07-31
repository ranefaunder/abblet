import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useLocation } from "preact-iso";
import { useEffect } from "preact/hooks";
import { t } from "/utils/i18n";
import { isLoggedIn } from "/app/stores/userStore";
import { splashUrl } from "/utils/app-url";

export const LoginPath = "/:lang/login" as const;

export default function Login({ params }: RoutePropsForPath<typeof LoginPath>) {
  const { route, query } = useLocation();
  const { lang } = params;
  const nextPath =
    query.next && query.next.startsWith("/") && !query.next.startsWith("//")
      ? query.next
      : splashUrl(lang);
  const registered = isLoggedIn();

  function redirectIfLoggedIn() {
    if (registered) route(nextPath, true);
  }
  useEffect(() => redirectIfLoggedIn(), [registered, nextPath, route]);

  if (registered) return null;

  const view = html`
    <div data-scope="Login">
      <div class="ambiance" aria-hidden="true">
        <span class="orb orb-a"></span>
        <span class="orb orb-b"></span>
        <span class="orb orb-c"></span>
        <span class="shine"></span>
      </div>
      <div class="hero" ui-column="gap-xl x-center y-center">
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
            ${t(
              "Remiix is an app store where you can remix any app to fit you — or make a new one. Sign in to continue.",
            )}
          </p>
        </div>
        <div class="cta" ui-column="gap-sm x-stretch">
          <button type="button" ui-button="primary lg block" commandfor="login-dialog" command="show-modal">
            ${t("Sign in")}
          </button>
          <button type="button" ui-button="tertiary lg block" commandfor="register-dialog" command="show-modal">
            ${t("Register")}
          </button>
        </div>
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="Login"]) to ([data-scope]) {
      & {
        --login-rise: 720ms cubic-bezier(0.16, 1, 0.3, 1);
        position: relative;
        isolation: isolate;
        flex: 1;
        display: flex;
        min-height: 0;
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

      .hero {
        position: relative;
        z-index: 1;
        flex: 1;
        width: 100%;
        max-width: 28rem;
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
        animation: rise-in var(--login-rise) both;
        animation-delay: 120ms;
      }

      .pitch {
        margin: 0;
        max-width: 38ch;
        font-size: 1.05rem;
        line-height: 1.45;
        color: var(--neutral-600);
        text-wrap: balance;
        animation: rise-in var(--login-rise) both;
        animation-delay: 220ms;
      }

      .cta {
        width: 100%;
        max-width: 18rem;
        margin-inline: auto;
        animation: rise-in var(--login-rise) both;
        animation-delay: 320ms;
      }

      .cta [ui-button~="primary"] {
        box-shadow: 0 10px 28px color-mix(in oklab, var(--primary-500) 28%, transparent);
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease;
      }

      .cta [ui-button~="primary"]:hover {
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
        .cta {
          animation: none !important;
        }

        .cta [ui-button~="primary"]:hover {
          transform: none;
        }
      }
    }
  `;

  return [view, style];
}
