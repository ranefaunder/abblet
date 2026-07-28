import { getPlatformOrigin } from "/utils/app-host";
import { t } from "/utils/i18n";
import type { Language } from "/types/i18n-types";

export function createWelcomeEmail(language: Language): { subject: string; text: string } {
  const siteUrl = `${getPlatformOrigin()}/${language}/`;
  return {
    subject: t("Welcome to Rmix!", language),
    text: `${t("Hello,", language)}

${t("Thank you for joining Rmix. Describe what you need and Rmix applies it — your first app in minutes.", language)}

${t("Open Rmix:\n$url", { url: siteUrl }, language)}

${t("Best regards\nRane Faunder\nFounder of Rmix", language)}`,
  };
}

export function createLoginCodeEmail(code: string, language: Language): { subject: string; text: string } {
  return {
    subject: t("Rmix - Login Code", language),
    text: `${t("Hello!", language)}

${t("Use the following code to log in to Rmix:", language)}

${code}

${t("Important:", language)}
${t("• Code is valid for 10 minutes", language)}
${t("• Code can only be used once", language)}
${t("• If you didn't request this code, you can safely ignore this message", language)}

${t("Rmix Team", language)}`,
  };
}

export function createFeedbackNotificationEmail(payload: {
  message: string;
  pageUrl: string;
  language: string;
  feedbackId: number;
  createdAt: string;
}): { subject: string; text: string } {
  return {
    subject: `Rmix feedback #${payload.feedbackId} (${payload.language})`,
    text: `New feedback (id ${payload.feedbackId})

Message:
${payload.message}

Page URL: ${payload.pageUrl}
Site language: ${payload.language}
Submitted at (UTC): ${payload.createdAt}
`,
  };
}

export async function sendEmailSafe(
  to: string,
  subject: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.APPSTUDO_E2E_SKIP_EMAIL === "1") {
    return { ok: true };
  }

  const trimmedTo = to.trim();
  const isDev = process.env.NODE_ENV !== "production";
  const resendTo = isDev ? "rane+maildump@pm.me" : trimmedTo;

  if (isDev) {
    console.info(`[email] Dev: Resend to=${resendTo} (intended: ${trimmedTo}) subject=${subject}`);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Email service unavailable. Try again later." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Rmix <no-reply@faunder.fi>",
        reply_to: "rane@faunder.fi",
        to: [resendTo],
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Resend error:", res.status, body);
      if (res.status === 429) return { ok: false, error: "Too many requests. Wait a moment before retrying." };
      return { ok: false, error: "Email service unavailable. Try again later." };
    }

    return { ok: true };
  } catch (error) {
    console.error("Email send failed:", error);
    return { ok: false, error: "Email service unavailable. Try again later." };
  }
}
