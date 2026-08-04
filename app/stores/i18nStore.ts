import { signal } from "@preact/signals";
import { ssrContext } from "/utils/ssr.client";
import { isClient } from "/utils/env";
import { getLang, pathWithLang } from "/utils/lang";
import { translations as staticTranslations } from "/i18n/translations";
import { AVAILABLE_LANGUAGES, type Language } from "/i18n/languages";

export const translations = signal<Record<string, string>>({});

const LANGUAGE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

function buildTranslationsForLang(langKey: Language): Record<string, string> {
  const result: Record<string, string> = {};
  const keys = Object.keys(staticTranslations) as (keyof typeof staticTranslations)[];
  for (const key of keys) {
    const val = staticTranslations[key];
    if (val && typeof val === "object" && "serverOnly" in val && (val as { serverOnly?: boolean }).serverOnly) {
      continue;
    }
    result[key] = langKey === "en" ? key : (val?.[langKey] ?? key);
  }
  return result;
}

export function initI18nStore(): void {
  const ctx = ssrContext();
  const fromCtx = ctx?.initialTranslations;
  if (fromCtx && Object.keys(fromCtx).length > 0) {
    translations.value = fromCtx;
    return;
  }
  if (isClient) {
    const langKey = getLang(window.location.pathname) ?? "en";
    translations.value = buildTranslationsForLang(langKey);
  }
}

/** Rebuild client UI strings + persist language preference. */
export function applyClientLanguage(lang: Language): void {
  if (!(lang in AVAILABLE_LANGUAGES)) return;
  translations.value = buildTranslationsForLang(lang);
  if (!isClient) return;
  document.documentElement.lang = lang;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `appstudo-language=${encodeURIComponent(lang)}; path=/; max-age=${LANGUAGE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
}

/**
 * Switch UI language: update translations, then navigate to the same page under the new lang.
 */
export function switchClientLanguage(
  lang: Language,
  currentPath: string,
  route: (url: string, replace?: boolean) => void,
): void {
  if (!(lang in AVAILABLE_LANGUAGES)) return;
  const nextPath = pathWithLang(currentPath, lang);
  applyClientLanguage(lang);
  route(nextPath, true);
}
