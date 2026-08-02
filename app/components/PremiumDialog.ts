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
      ui-dialog="sm"
      closedby="any"
    >
      <header class="prem-header" ui-row="x-between y-start gap-md">
        <div class="prem-intro" ui-column="gap-sm">
          <p class="prem-eyebrow">${t("Remiix Premium")}</p>
          <h2 class="prem-title">${t("Activate Premium")}</h2>
          <p class="prem-lede">
            ${t("Early access — Premium is free for now. Paid billing is coming later, and you won’t be moved to a paid plan automatically.")}
          </p>
        </div>
        <button
          type="button"
          ui-button="square inline"
          ui-icon="x"
          onClick=${close}
          aria-label=${t("Close")}
        ></button>
      </header>

      <form id="premium-activate-form" class="prem-body" ui-column="gap-md" onSubmit=${activate}>
        <div class="prem-pricing" ui-column="gap-md">
          <div class="prem-price-row" ui-row="x-between y-center gap-md">
            <span>${t("List price")}</span>
            <span class="prem-list-price">${formatUsdAmount(premiumPrice)}/mo</span>
          </div>
          <div class="prem-price-row prem-discount" ui-row="x-between y-center gap-md">
            <span>${t("Early access discount")}</span>
            <span>−100%</span>
          </div>
          <div class="prem-price-row prem-due" ui-row="x-between y-center gap-md">
            <strong>${t("Due today")}</strong>
            <strong>$0</strong>
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

      <footer class="prem-footer" ui-row="gap-sm x-end wrap">
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
        max-width: 26rem;
      }

      .prem-eyebrow {
        margin: 0;
        font-size: 0.75rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--neutral-500);
      }

      .prem-title {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 650;
      }

      .prem-lede {
        margin: 0;
        color: var(--neutral-600);
        line-height: 1.45;
        font-size: 0.95rem;
      }

      /* Faunder: header 24/24/16, body inline 24, footer 16/24/24 — don't re-pad the body shell */
      .prem-body {
        margin: 0;
        box-sizing: border-box;
      }

      .prem-pricing {
        padding: 1rem 1.1rem;
        border-radius: 0.85rem;
        background: var(--neutral-50);
        border: 1px solid var(--neutral-200);
      }

      .prem-price-row {
        font-size: 0.95rem;
        color: var(--neutral-700);
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
        padding-top: 0.65rem;
        border-top: 1px solid var(--neutral-200);
        font-size: 1.05rem;
        color: var(--neutral-950);
      }

      .prem-credit-note {
        margin: 0;
        font-size: 0.85rem;
        color: var(--neutral-600);
      }

      .prem-body input:disabled {
        opacity: 1;
        color: var(--neutral-800);
        background: var(--neutral-100);
      }
    }
  `;

  return html`${view}${style}`;
}
