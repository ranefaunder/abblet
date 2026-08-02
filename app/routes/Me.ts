import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { t } from "/utils/i18n";
import {
  user,
  logout,
  updateMarketingOptIn,
  isLoggedIn,
} from "/app/stores/userStore";
import { apps as libraryApps, loadApps } from "/app/stores/appStore";
import { createUrl, splashUrl } from "/utils/app-url";
import { AVAILABLE_LANGUAGES, type Language } from "/i18n/languages";
import { pathWithLang } from "/utils/lang";
import { apiFetch } from "/utils/api.client";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter } from "/utils/app-preview";
import AppGrid from "/app/components/AppGrid";
import { openPremiumDialog } from "/app/components/PremiumDialog";

export const MePath = "/:lang/me" as const;

type CreditDailySpend = { day: string; spentUsd: number };
type CreditAppSpend = {
  kind: "build" | "runtime";
  slug: string | null;
  title: string | null;
  iconId: string | null;
  spentUsd: number;
};
type CreditAppBreakdown = {
  key: string;
  slug: string;
  title: string;
  iconId: string | null;
  buildUsd: number;
  runtimeUsd: number;
  totalUsd: number;
};
type CreditsSnapshot = {
  balanceUsd: number;
  freeGrantUsd: number;
  grantUsd: number;
  plan: "free" | "premium";
  periodYm: string;
  dailySpend: CreditDailySpend[];
  byApp: CreditAppSpend[];
};

const JOIN_FEATURES = [
  {
    icon: "git-fork",
    title: "Remix any app",
    body: "Open a Store app and ask Remiix to change it until it fits you.",
  },
  {
    icon: "magic-wand",
    title: "Build with AI",
    body: "Describe an idea and get a working app in minutes — no code needed.",
  },
  {
    icon: "wallet",
    title: "Monthly AI credit",
    body: "Free tops up to a small balance each month. Premium adds a larger amount every month — unused credit stacks.",
  },
  {
    icon: "squares-four",
    title: "Your apps in one place",
    body: "See the apps you made, open them anytime, and install them to your home screen.",
  },
  {
    icon: "share",
    title: "Publish to the Store",
    body: "Share what you built so others can use it — and remix it further.",
  },
] as const;

export default function Me({ params }: RoutePropsForPath<typeof MePath>) {
  const { path, route } = useLocation();
  const { lang } = params;
  const [marketingBusy, setMarketingBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [credits, setCredits] = useState<CreditsSnapshot | null>(null);
  const loggedIn = isLoggedIn();
  const account = user.value;
  const ownedApps = libraryApps.value.filter((app) => app.owned);
  const ownedGridItems = ownedApps.map((app) => ({
    slug: app.slug,
    title: app.title,
    iconId: app.iconId,
    href: createUrl(lang, app.slug),
    subtitle: app.isDraft ? t("Draft") : app.tagline || app.category || t("App"),
  }));
  const currentPath = path ?? `/${lang}/me`;

  useEffect(() => {
    if (!loggedIn) {
      setCredits(null);
      return;
    }
    void loadApps();

    async function loadCredits() {
      const result = await apiFetch<{
        balanceUsd: number;
        freeGrantUsd: number;
        grantUsd?: number;
        plan?: "free" | "premium";
        periodYm: string;
        dailySpend?: CreditDailySpend[];
        byApp?: CreditAppSpend[];
      }>(`/api/${lang}/credits`);
      if (!result.success) {
        setCredits(null);
        return;
      }
      setCredits({
        balanceUsd: result.data.balanceUsd,
        freeGrantUsd: result.data.freeGrantUsd,
        grantUsd: result.data.grantUsd ?? result.data.freeGrantUsd,
        plan: result.data.plan ?? "free",
        periodYm: result.data.periodYm,
        dailySpend: result.data.dailySpend ?? [],
        byApp: result.data.byApp ?? [],
      });
    }

    void loadCredits();

    const onRedeemed = () => {
      void loadCredits();
    };
    window.addEventListener("premium-redeemed", onRedeemed);
    return () => window.removeEventListener("premium-redeemed", onRedeemed);
  }, [loggedIn, lang]);

  function formatCreditDay(isoDay: string): string {
    const d = new Date(`${isoDay}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return isoDay;
    try {
      return new Intl.DateTimeFormat(lang === "fi" ? "fi-FI" : "en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(d);
    } catch {
      return isoDay;
    }
  }

  function formatSpendUsd(amount: number): string {
    if (amount < 0.01) return `$${amount.toFixed(4)}`;
    return `$${amount.toFixed(2)}`;
  }

  function mergeAppSpend(rows: CreditAppSpend[]): CreditAppBreakdown[] {
    const map = new Map<string, CreditAppBreakdown>();
    for (const row of rows) {
      const slug = row.slug?.trim() || "";
      const key = slug || row.title?.trim() || "unknown";
      const cur = map.get(key) ?? {
        key,
        slug: slug || key,
        title: row.title?.trim() || slug || t("Unknown app"),
        iconId: row.iconId,
        buildUsd: 0,
        runtimeUsd: 0,
        totalUsd: 0,
      };
      if (row.title?.trim()) cur.title = row.title.trim();
      if (row.iconId) cur.iconId = row.iconId;
      if (row.kind === "build") cur.buildUsd += row.spentUsd;
      else cur.runtimeUsd += row.spentUsd;
      cur.totalUsd = cur.buildUsd + cur.runtimeUsd;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.totalUsd - a.totalUsd);
  }

  const appBreakdown = mergeAppSpend(credits?.byApp ?? []);

  async function handleLogout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await logout();
      route(splashUrl(lang), true);
    } finally {
      setLogoutBusy(false);
    }
  }

  async function handleMarketingChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const checked = input.checked;
    if (marketingBusy) {
      input.checked = !checked;
      return;
    }
    setMarketingBusy(true);
    const ok = await updateMarketingOptIn(checked);
    if (!ok) input.checked = !checked;
    setMarketingBusy(false);
  }

  const langPicker = html`
    <div class="lang-picker" ui-row="gap-sm y-center">
      <i ui-icon="globe" aria-hidden="true"></i>
      <select
        id="me-lang"
        class="lang-select"
        value=${lang}
        aria-label=${t("Language")}
        ui-input="sm"
        onChange=${(e: Event) => {
          const next = (e.currentTarget as HTMLSelectElement).value as Language;
          if (!next || next === lang) return;
          route(pathWithLang(currentPath, next), true);
        }}
      >
        ${(Object.keys(AVAILABLE_LANGUAGES) as Language[]).map(
          (code) => html`
            <option value=${code} lang=${code} selected=${code === lang}>
              ${AVAILABLE_LANGUAGES[code].nativeName}
            </option>
          `,
        )}
      </select>
    </div>
  `;

  const view = html`
    <div data-scope="Me">
      <div class="content" ui-column="gap-2xl" ui-padding="inline-md">
        <header class="page-head" ui-row="x-between y-start gap-md">
          <div ui-column="gap-sm">
            <h1 class="page-title">${t("Me")}</h1>
            <p class="page-lede">
              ${loggedIn
                ? t("Your apps, settings, and account.")
                : t("Create a free account to remix apps, build your own with AI, and keep everything in one place.")}
            </p>
          </div>
          ${langPicker}
        </header>

        ${!loggedIn
          ? html`
            <section class="join" ui-column="gap-xl">
              <div ui-column="gap-sm">
                <h2 class="join-title">${t("Make Remiix yours")}</h2>
              </div>

              <ul class="benefits" ui-off>
                ${JOIN_FEATURES.map(
                  (feature) => html`
                    <li class="benefit" ui-row="gap-md y-start">
                      <span class="benefit-icon" aria-hidden="true">
                        <i ui-icon=${`${feature.icon} lg`}></i>
                      </span>
                      <span ui-column="gap-xs">
                        <strong class="benefit-title">${t(feature.title)}</strong>
                        <span class="benefit-body">${t(feature.body)}</span>
                      </span>
                    </li>
                  `,
                )}
              </ul>

              <div class="join-cta" ui-column="gap-sm">
                <button
                  type="button"
                  ui-button="primary lg block"
                  commandfor="login-dialog"
                  command="show-modal"
                >
                  ${t("Sign in")}
                </button>
                <button
                  type="button"
                  ui-button="tertiary lg block"
                  commandfor="register-dialog"
                  command="show-modal"
                >
                  ${t("Register")}
                </button>
              </div>
            </section>`
          : html`
            <section ui-column="gap-md">
              <h2 class="section-title">${t("My Apps")}</h2>
              ${ownedApps.length === 0
                ? html`
                  <div class="panel empty" ui-column="gap-sm">
                    <p ui-heading="sm">${t("No apps of your own yet")}</p>
                    <p>${t("Create an app to see it here.")}</p>
                  </div>`
                : html`
                  <${AppGrid}
                    items=${ownedGridItems}
                    label=${t("My Apps")}
                  />`}
            </section>

            ${account
              ? html`
                <section class="panel" ui-column="gap-lg">
                  <header ui-column="gap-xs">
                    <h2 class="panel-title">${t("Account")}</h2>
                    <p class="panel-lede">${t("Signed in to Remiix with this email.")}</p>
                  </header>

                  <div ui-column="gap-md">
                    <div ui-field>
                      <label for="me-email">${t("Email")}</label>
                      <input
                        id="me-email"
                        type="email"
                        value=${account.email}
                        readonly
                        autocomplete="email"
                      />
                    </div>
                  </div>

                  <label class="pref-row" ui-row="gap-md y-center x-between">
                    <span ui-column="gap-xs">
                      <strong>${t("Product updates")}</strong>
                      <small>${t("Email me about Remiix updates")}</small>
                    </span>
                    <input
                      type="checkbox"
                      ui-input="switch"
                      checked=${account.marketingOptIn === true}
                      disabled=${marketingBusy}
                      aria-busy=${marketingBusy ? "true" : undefined}
                      onChange=${handleMarketingChange}
                    />
                  </label>

                  <div class="panel-actions" ui-row="gap-sm wrap">
                    <button
                      type="button"
                      ui-button
                      aria-busy=${logoutBusy ? "true" : undefined}
                      disabled=${logoutBusy}
                      onClick=${handleLogout}
                    >
                      ${t("Log out")}
                    </button>
                  </div>
                </section>`
              : ""}

            ${credits
              ? html`
                <section class="panel credits" ui-column="gap-lg">
                  <header class="credits-head" ui-row="x-between y-start gap-md">
                    <div ui-column="gap-sm">
                      <div ui-row="gap-sm y-center wrap">
                        <h2 class="panel-title">${t("AI credit")}</h2>
                        <span class=${`plan-badge${credits.plan === "premium" ? " is-premium" : ""}`}>
                          ${credits.plan === "premium" ? t("Premium") : t("Free")}
                        </span>
                      </div>
                      <p class="credits-balance">$${credits.balanceUsd.toFixed(2)}</p>
                      <p class="credits-grant">
                        ${credits.plan === "premium"
                          ? t("+$amount added each month", {
                              amount: `$${credits.grantUsd.toFixed(2)}`,
                            })
                          : t("Tops up to $amount each month", {
                              amount: `$${credits.grantUsd.toFixed(2)}`,
                            })}
                      </p>
                      ${credits.plan === "premium"
                        ? html`
                          <p class="credits-grant-note">
                            ${t("Unused Premium credit stacks — it doesn’t reset to zero.")}
                          </p>`
                        : ""}
                    </div>
                    <div ui-row="gap-sm wrap y-start">
                      ${credits.plan !== "premium"
                        ? html`
                          <button
                            type="button"
                            ui-button="primary sm"
                            onClick=${() => openPremiumDialog()}
                          >
                            ${t("Get Premium")}
                          </button>`
                        : html`
                          <span class="credits-premium-note">${t("You're on Premium")}</span>`}
                    </div>
                  </header>

                  <div class="credits-usage" ui-column="gap-md">
                    <h3 class="credits-usage-title">${t("Daily usage")}</h3>
                    ${credits.dailySpend.length > 0
                      ? html`
                        <ul class="credits-days" ui-off>
                          ${credits.dailySpend.map(
                            (row) => html`
                              <li class="credits-day">
                                <span class="credits-day-date">${formatCreditDay(row.day)}</span>
                                <span class="credits-day-amount">${formatSpendUsd(row.spentUsd)}</span>
                              </li>`,
                          )}
                        </ul>`
                      : html`<p class="credits-empty">${t("No AI usage yet.")}</p>`}
                    ${appBreakdown.length > 0
                      ? html`
                        <button
                          type="button"
                          ui-button="sm"
                          commandfor="me-credits-by-app"
                          command="show-modal"
                        >
                          ${t("By app")}
                        </button>`
                      : ""}
                  </div>

                  ${appBreakdown.length > 0
                    ? html`
                      <dialog id="me-credits-by-app" class="credits-dialog" ui-dialog="sm" closedby="any">
                        <header ui-row="x-between y-center gap-md">
                          <h2 ui-heading="sm">${t("By app")}</h2>
                          <button
                            type="button"
                            ui-button="inline"
                            ui-icon="x"
                            commandfor="me-credits-by-app"
                            command="close"
                            aria-label=${t("Close")}
                          ></button>
                        </header>
                        <ul class="credits-apps" ui-off>
                          ${appBreakdown.map((app) => {
                            const iconSrc = appIconSrc(app.iconId);
                            return html`
                              <li class="credits-app">
                                <span
                                  class="credits-app-icon"
                                  style=${`background: ${previewGradient(app.slug)}`}
                                  aria-hidden="true"
                                >
                                  ${iconSrc
                                    ? html`<img src=${iconSrc} alt="" width="40" height="40" decoding="async" />`
                                    : html`<span>${draftLetter(app.title)}</span>`}
                                </span>
                                <div class="credits-app-body">
                                  <strong class="credits-app-name">${app.title}</strong>
                                  <dl class="credits-app-meta">
                                    ${app.buildUsd > 0
                                      ? html`
                                        <div>
                                          <dt>${t("Building")}</dt>
                                          <dd>${formatSpendUsd(app.buildUsd)}</dd>
                                        </div>`
                                      : ""}
                                    ${app.runtimeUsd > 0
                                      ? html`
                                        <div>
                                          <dt>${t("Using")}</dt>
                                          <dd>${formatSpendUsd(app.runtimeUsd)}</dd>
                                        </div>`
                                      : ""}
                                  </dl>
                                </div>
                              </li>`;
                          })}
                        </ul>
                      </dialog>`
                    : ""}
                </section>`
              : ""}`}
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="Me"]) to ([data-scope]) {
      & {
        color: var(--neutral-900);
      }

      .content {
        padding-top: 1.35rem;
        padding-bottom: 0.5rem;
        max-width: 48rem;
        margin-inline: auto;
        width: 100%;
        box-sizing: border-box;
      }

      .page-head {
        align-items: flex-start;
      }

      .page-head .lang-picker {
        flex: none;
        margin-top: 0.2rem;
        color: var(--neutral-600);
      }

      .page-head .lang-select {
        flex: none;
        width: auto;
        max-width: 11rem;
      }

      .page-title {
        margin: 0;
        font-size: clamp(2.1rem, 6vw, 2.75rem);
        font-weight: 800;
        letter-spacing: -0.05em;
        line-height: 1;
        color: var(--neutral-950);
      }

      .page-lede,
      .panel-lede {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.45;
        color: var(--neutral-600);
      }

      .panel-lede {
        font-size: 0.9375rem;
      }

      .section-title,
      .panel-title {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 700;
        letter-spacing: -0.025em;
        color: var(--neutral-950);
      }

      .join-title {
        margin: 0;
        font-size: clamp(1.45rem, 4.5vw, 1.85rem);
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1.15;
        color: var(--neutral-950);
      }

      .benefits {
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 1.15rem;
      }

      .benefit-icon {
        flex: none;
        display: grid;
        place-items: center;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 0.85rem;
        background: color-mix(in oklab, var(--primary-100) 75%, var(--white));
        color: var(--primary-700);
      }

      .benefit-title {
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--neutral-950);
      }

      .benefit-body {
        font-size: 0.9375rem;
        line-height: 1.45;
        color: var(--neutral-600);
      }

      .join-cta {
        width: 100%;
        max-width: 18rem;
      }

      .panel {
        padding: 1.35rem 1.25rem 1.4rem;
        border-radius: 1.15rem;
        border: 1px solid var(--neutral-200);
        background: var(--white);
      }

      .panel.empty {
        align-items: flex-start;
      }

      .pref-row {
        margin: 0;
        padding: 0.85rem 1rem;
        border-radius: 0.9rem;
        border: 1px solid var(--neutral-200);
        background: var(--neutral-50);
        cursor: pointer;
      }

      .pref-row strong {
        font-size: 0.9375rem;
        color: var(--neutral-950);
      }

      .pref-row small {
        font-size: 0.8125rem;
        color: var(--neutral-600);
      }

      .pref-row input[ui-input~="switch"] {
        flex: none;
      }

      [ui-field] input[readonly] {
        color: var(--neutral-800);
        background: var(--neutral-50);
      }

      .credits-head {
        align-items: flex-start;
      }

      .credits-head > [ui-button] {
        flex: none;
        margin-top: 0.1rem;
      }

      .credits-balance {
        margin: 0;
        font-size: clamp(2rem, 5vw, 2.5rem);
        font-weight: 800;
        letter-spacing: -0.045em;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        color: var(--neutral-950);
      }

      .credits-grant {
        margin: 0;
        font-size: 0.875rem;
        color: var(--neutral-500);
      }

      .credits-grant-note {
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.4;
        color: var(--neutral-500);
        max-width: 28rem;
      }

      .plan-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        background: var(--neutral-100);
        color: var(--neutral-700);
      }

      .plan-badge.is-premium {
        background: var(--primary-100, var(--neutral-200));
        color: var(--primary-800, var(--neutral-900));
      }

      .credits-premium-note {
        font-size: 0.875rem;
        color: var(--neutral-600);
        margin-top: 0.25rem;
      }

      .credits-upgrade-hint {
        margin: 0;
      }

      .credits-usage {
        gap: 0.75rem;
      }

      .credits-usage-title {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--neutral-500);
      }

      .credits-empty {
        margin: 0;
        font-size: 0.875rem;
        color: var(--neutral-500);
      }

      .credits-days {
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }

      .credits-day {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.7rem 0;
        border-top: 1px solid var(--neutral-100);
      }

      .credits-day:first-child {
        border-top: none;
        padding-top: 0;
      }

      .credits-day-date {
        font-size: 0.9375rem;
        color: var(--neutral-600);
      }

      .credits-day-amount {
        font-size: 0.9375rem;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
        color: var(--neutral-950);
      }

      .credits-apps {
        margin: 0;
        display: flex;
        flex-direction: column;
      }

      .credits-app {
        display: flex;
        align-items: flex-start;
        gap: 0.85rem;
        padding: 1rem 0;
        border-top: 1px solid var(--neutral-100);
      }

      .credits-app:first-child {
        border-top: none;
        padding-top: 0.25rem;
      }

      .credits-app:last-child {
        padding-bottom: 0.15rem;
      }

      .credits-app-icon {
        flex: none;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 0.65rem;
        overflow: hidden;
        display: grid;
        place-items: center;
        color: var(--white);
        font-size: 0.95rem;
        font-weight: 750;
      }

      .credits-app-icon img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .credits-app-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }

      .credits-app-name {
        margin: 0;
        font-size: 0.9375rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.25;
        color: var(--neutral-950);
        overflow-wrap: anywhere;
      }

      .credits-app-meta {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }

      .credits-app-meta > div {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
      }

      .credits-app-meta dt {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--neutral-500);
      }

      .credits-app-meta dd {
        margin: 0;
        font-size: 0.8125rem;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
        color: var(--neutral-900);
      }
    }
  `;

  return [view, style];
}
