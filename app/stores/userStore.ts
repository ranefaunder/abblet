import { signal } from "@preact/signals";
import { apiFetch } from "/utils/api.client";
import { getLang } from "/utils/lang";
import { ssrContext } from "/utils/ssr.client";
import { clearApps, loadApps } from "/app/stores/appStore";
import type { LoggedInUser } from "/types/user-types";
import type { Language } from "/types/i18n-types";
import { parseJson } from "/utils/json";

type StoredUser = LoggedInUser & {
  created_at?: string;
  last_login?: string;
};

function normalizeStoredUser(u: StoredUser): LoggedInUser {
  const { created_at, last_login, isGuest: _guest, ...rest } = u as StoredUser & {
    isGuest?: boolean;
  };
  return {
    ...rest,
    createdAt: u.createdAt ?? created_at ?? "",
    lastLogin: u.lastLogin ?? last_login,
  };
}

const loadUserFromStorage = (): LoggedInUser | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("appstudo-user");
    if (stored) {
      const u = parseJson<StoredUser & { isGuest?: boolean }>(stored);
      if (u?.isGuest) {
        localStorage.removeItem("appstudo-user");
        return null;
      }
      if (u) return normalizeStoredUser(u);
    }
  } catch (error) {
    console.warn("Failed to load user from localStorage:", error);
  }
  return null;
};

const saveUserToStorage = (currentUser: LoggedInUser | null) => {
  if (typeof window === "undefined") return;
  try {
    if (currentUser) {
      localStorage.setItem("appstudo-user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("appstudo-user");
    }
  } catch (error) {
    console.warn("Failed to save user to localStorage:", error);
  }
};

export const user = signal<LoggedInUser | null>(loadUserFromStorage());

export function initAuthStore() {
  const { initialUser } = ssrContext();
  if (initialUser) {
    const normalized = normalizeStoredUser(initialUser as StoredUser);
    user.value = normalized;
    saveUserToStorage(normalized);
  } else if (initialUser === null) {
    user.value = null;
    saveUserToStorage(null);
  }
}

export async function updateMarketingOptIn(marketingOptIn: boolean): Promise<boolean> {
  if (!user.value) return false;
  try {
    const lang = getLang(window.location.pathname) ?? "en";
    const result = await apiFetch<{ marketingOptIn: boolean }>(`/api/${lang}/user/marketing`, {
      method: "POST",
      body: JSON.stringify({ marketingOptIn }),
    });
    if (!result.success) return false;
    user.value = { ...user.value, marketingOptIn: result.data.marketingOptIn };
    saveUserToStorage(user.value);
    return true;
  } catch (error) {
    console.error("Failed to update marketing preference:", error);
    return false;
  }
}

export const login = async (
  email: string,
  code: string,
): Promise<{ success: boolean; error?: string; errorMessage?: string }> => {
  try {
    if (!email || !code) {
      return { success: false, error: "EMAIL_AND_CODE_REQUIRED", errorMessage: "Email and code are required." };
    }
    const lang = getLang(window.location.pathname) ?? "en";
    const result = await apiFetch<{ user: StoredUser }>(`/api/${lang}/auth/verify-login-code`, {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
    if (!result.success) {
      return {
        success: false,
        error: result.error.code,
        errorMessage: result.error.message,
      };
    }
    if (result.data.user) {
      const normalized = normalizeStoredUser(result.data.user);
      user.value = normalized;
      localStorage.setItem("appstudo-user", JSON.stringify(normalized));
      void loadApps();
      return { success: true };
    }
    return { success: false, error: "LOGIN_CODE_INVALID", errorMessage: "Invalid code" };
  } catch (error) {
    console.error("Login failed:", error);
    return { success: false, error: "NETWORK_ERROR", errorMessage: "Network error" };
  }
};

export const register = async (
  email: string,
  language: string = "en",
  termsAccepted: boolean = false,
  marketingOptIn: boolean = false,
): Promise<{
  success: boolean;
  registration?: boolean;
  user?: LoggedInUser;
  existingUser?: boolean;
  error?: string;
  errorMessage?: string;
}> => {
  try {
    const result = await apiFetch<{
      existingUser?: boolean;
      registration?: boolean;
      user?: StoredUser;
    }>(`/api/${language}/auth/register`, {
      method: "POST",
      body: JSON.stringify({ email, language, termsAccepted, marketingOptIn }),
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error.code,
        errorMessage: result.error.message,
      };
    }
    if (result.data.existingUser) return { success: true, existingUser: true };
    if (result.data.registration && result.data.user) {
      const normalized = normalizeStoredUser(result.data.user);
      user.value = normalized;
      saveUserToStorage(normalized);
      void loadApps();
      return { success: true, registration: true, user: normalized };
    }
    return { success: false };
  } catch (error) {
    console.error("Failed to register:", error);
    return { success: false, error: "NETWORK_ERROR", errorMessage: "Network error" };
  }
};

export const requestLoginCode = async (
  email: string,
  language: string = "en",
): Promise<{ success: boolean; debugCode?: string; error?: string; errorMessage?: string }> => {
  try {
    const result = await apiFetch<{ debugCode?: string }>(`/api/${language}/auth/request-login-code`, {
      method: "POST",
      body: JSON.stringify({ email, language }),
    });
    if (result.success) return { success: true, debugCode: result.data.debugCode };
    return {
      success: false,
      error: result.error.code,
      errorMessage: result.error.message,
    };
  } catch (error) {
    console.error("Failed to request login code:", error);
    return { success: false, error: "NETWORK_ERROR", errorMessage: "Network error" };
  }
};

export const logout = async () => {
  try {
    const lang = getLang(window.location.pathname) ?? "en";
    await apiFetch(`/api/${lang}/auth/logout`, { method: "POST" });
  } catch (error) {
    console.error("Logout API call failed:", error);
  } finally {
    user.value = null;
    saveUserToStorage(null);
    clearApps();
    Object.keys(localStorage)
      .filter((key) => key.startsWith("appstudo-"))
      .forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn(`Failed to remove localStorage key ${key}:`, error);
        }
      });
  }
};

export const isLoggedIn = (): boolean => user.value !== null;

/** Open the login dialog (links to register). */
export function openLoginDialog(): void {
  if (typeof document === "undefined") return;
  (document.getElementById("login-dialog") as HTMLDialogElement | null)?.showModal();
}

/** Returns true if signed in; otherwise opens login and returns false. */
export function requireLogin(): boolean {
  if (isLoggedIn()) return true;
  openLoginDialog();
  return false;
}

/** Apply a user payload from an API response. */
export function applySessionUser(raw: StoredUser | LoggedInUser): LoggedInUser {
  const normalized = normalizeStoredUser(raw as StoredUser);
  user.value = normalized;
  saveUserToStorage(normalized);
  return normalized;
}

/** Sync client user from session cookie. */
export async function refreshSessionUser(): Promise<LoggedInUser | null> {
  try {
    const lang = getLang(window.location.pathname) ?? "en";
    const result = await apiFetch<StoredUser>(`/api/${lang}/user/me`, { method: "GET" });
    if (!result.success) {
      if (result.status === 401) {
        user.value = null;
        saveUserToStorage(null);
      }
      return null;
    }
    return applySessionUser(result.data);
  } catch (error) {
    console.error("Failed to refresh session user:", error);
    return null;
  }
}

export const verifyAuthStatus = async (): Promise<boolean> => {
  if (!user.value) return false;
  try {
    const lang = getLang(window.location.pathname) ?? "en";
    const result = await apiFetch(`/api/${lang}/user/me`, { method: "GET" });
    if (!result.success && result.status === 401) {
      user.value = null;
      localStorage.removeItem("appstudo-user");
      return false;
    }
    return true;
  } catch (error) {
    console.error("Auth verification failed:", error);
    return false;
  }
};

export const getCurrentUser = (): LoggedInUser | null => user.value;
