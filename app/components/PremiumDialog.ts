import { html, css } from "/utils/markup";
import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "/utils/i18n";
import { apiFetch } from "/utils/api.client";
import { getLang } from "/utils/lang";
import { isLoggedIn, openLoginDialog, refreshSessionUser } from "/app/stores/userStore";
import {
  PREMIUM_GRANT_USD,
  PREMIUM_PRICE_USD,
  formatUsdAmount,
} from "/utils/billing-plans";

export const PREMIUM_DIALOG_ID = "premium-dialog";

/** Locked early-access code (must exist in gift_codes as EARLYACCESS after normalize). */
export const EARLY_ACCESS_GIFT_CODE = "EARLY ACCESS";

export function openPremiumDialog() {
  window.dispatchEvent(new CustomEvent("open-premium-dialog"));
}

/** Activate Premium via locked early-access code (Polar checkout later). */
export default function PremiumDialog({
  onRedeemed,
}: {
  onRedeemed?: () => void;
} = {}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumGrant, setPremiumGrant] = useState(PREMIUM_GRANT_USD);
  const [premiumPrice, setPremiumPrice] = useState(PREMIUM_PRICE_USD);

  useEffect(() => {
    const handler = () => {
      setError(null);
      dialogRef.current?.showModal();
      void (async () => {
        if (!isLoggedIn()) return;
        const lang = getLang(window.location.pathname) ?? "en";
        const result = await apiFetch<{
          grantUsd: number;
          premiumPriceUsd: number;
          plan: string;
        }>(`/api/${lang}/billing/status`);
        if (result.success) {
          setPremiumPrice(result.data.premiumPriceUsd);
          if (result.data.plan === "premium") {
            setPremiumGrant(result.data.grantUsd);
          }
        }
      })();
    };
    window.addEventListener("open-premium-dialog", handler);
    return () => window.removeEventListener("open-premium-dialog", handler);
  }, []);

  function close() {
    dialogRef.current?.close();
  }

  async function activate(e: Event) {
    e.preventDefault();
    if (!isLoggedIn()) {
      close();
      openLoginDialog();
      return;
    }
    setBusy(true);
    setError(null);
    const lang = getLang(window.location.pathname) ?? "en";
    try {
      const result = await apiFetch<{
        plan: string;
        balanceUsd: number;
        grantUsd: number;
      }>(`/api/${lang}/billing/redeem-gift`, {
        method: "POST",
        body: JSON.stringify({ code: EARLY_ACCESS_GIFT_CODE }),
      });
      if (!result.success) {
        setError(result.error.message ?? result.error.code);
        return;
      }
      await refreshSessionUser();
      onRedeemed?.();
      window.dispatchEvent(new CustomEvent("premium-redeemed"));
      close();
    } finally {
      setBusy(false);
    }
  }

  const view = html`
    <dialog
      id=${PREMIUM_DIALOG_ID}
      ref=${dialogRef}
      class="premium-dialog"
      data-scope="PremiumDialog"
      ui-dialog="xs"
      closedby="any"
    >
      <header class="prem-header" ui-row="x-between y-start gap-sm">
        <div class="prem-intro" ui-column="gap-sm">
          <p class="prem-eyebrow">${t("Remiix Premium")}</p>
          <h2 class="prem-title">${t("Activate Premium")}</h2>
          <p class="prem-lede">
            ${t("Early access — Premium is free for now. Paid billing is coming later, and you won’t be moved to a paid plan automatically.")}
          </p>
        </div>
        <button
          type="button"
          class="prem-close"
          ui-button="square inline"
          ui-icon="x"
          onClick=${close}
          aria-label=${t("Close")}
        ></button>
      </header>

      <form id="premium-activate-form" class="prem-body" ui-column="gap-md" onSubmit=${activate}>
        <div class="prem-pricing" ui-column="gap-sm">
          <div class="prem-price-row">
            <span class="prem-price-label">${t("List price")}</span>
            <span class="prem-list-price">${formatUsdAmount(premiumPrice)}/mo</span>
          </div>
          <div class="prem-price-row prem-discount">
            <span class="prem-price-label">${t("Early access discount")}</span>
            <span class="prem-price-value">−100%</span>
          </div>
          <div class="prem-price-row prem-due">
            <strong class="prem-price-label">${t("Due today")}</strong>
            <strong class="prem-price-value">$0</strong>
          </div>
          <p class="prem-credit-note">
            ${t("+$amount added each month. Unused credit stacks — it doesn’t reset.", {
              amount: formatUsdAmount(premiumGrant),
            })}
          </p>
        </div>

        <div ui-field>
          <label for="premium-gift-code">${t("Code")}</label>
          <input
            id="premium-gift-code"
            type="text"
            name="code"
            value=${EARLY_ACCESS_GIFT_CODE}
            disabled
            readonly
            autocomplete="off"
          />
          ${error ? html`<p role="error">${error}</p>` : html`<p></p>`}
        </div>
      </form>

      <footer class="prem-footer" ui-row="gap-sm x-stretch wrap">
        <button type="button" ui-button onClick=${close} disabled=${busy}>
          ${t("Close")}
        </button>
        <button
          type="submit"
          form="premium-activate-form"
          ui-button="primary"
          aria-busy=${busy ? "true" : undefined}
          disabled=${busy}
        >
          ${busy ? t("Activating…") : t("Activate Premium")}
        </button>
      </footer>
    </dialog>
  `;

  const style = css`
    @scope ([data-scope="PremiumDialog"]) to ([data-scope]) {
      &.premium-dialog {
        box-sizing: border-box;
        width: min(22rem, calc(100vw - 1.25rem));
        max-width: calc(100vw - 1.25rem);
        max-height: calc(
          100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.25rem
        );
        margin: max(0.5rem, env(safe-area-inset-top, 0px)) auto
          max(0.5rem, env(safe-area-inset-bottom, 0px));
        overflow: hidden;
      }

      &.premium-dialog[open] {
        display: flex;
        flex-direction: column;
      }

      .prem-header,
      .prem-footer {
        flex: 0 0 auto;
        min-width: 0;
      }

      .prem-intro {
        min-width: 0;
        flex: 1 1 auto;
      }

      .prem-close {
        flex: 0 0 auto;
      }

      .prem-eyebrow {
        margin: 0;
        font-size: 0.7rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--neutral-500);
      }

      .prem-title {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 650;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }

      .prem-lede {
        margin: 0;
        color: var(--neutral-600);
        line-height: 1.4;
        font-size: 0.875rem;
        overflow-wrap: anywhere;
      }

      .prem-body {
        margin: 0;
        box-sizing: border-box;
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }

      .prem-pricing {
        min-width: 0;
        padding: 0.75rem 0.85rem;
        border-radius: 0.75rem;
        background: var(--neutral-50);
        border: 1px solid var(--neutral-200);
      }

      .prem-price-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
        min-width: 0;
        font-size: 0.875rem;
        color: var(--neutral-700);
      }

      .prem-price-label {
        min-width: 0;
        flex: 1 1 auto;
        overflow-wrap: anywhere;
        line-height: 1.35;
      }

      .prem-price-value,
      .prem-list-price {
        flex: 0 0 auto;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }

      .prem-list-price {
        text-decoration: line-through;
        color: var(--neutral-500);
      }

      .prem-discount {
        color: var(--success-700, #0d7a4f);
        font-weight: 600;
      }

      .prem-due {
        padding-top: 0.5rem;
        border-top: 1px solid var(--neutral-200);
        font-size: 0.95rem;
        color: var(--neutral-950);
      }

      .prem-credit-note {
        margin: 0;
        font-size: 0.8rem;
        line-height: 1.35;
        color: var(--neutral-600);
        overflow-wrap: anywhere;
      }

      .prem-body input:disabled {
        opacity: 1;
        color: var(--neutral-800);
        background: var(--neutral-100);
        max-width: 100%;
        box-sizing: border-box;
      }

      .prem-footer > :where(button) {
        flex: 1 1 auto;
        min-width: min(100%, 8rem);
      }
    }
  `;

  return html`${view}${style}`;
}
