declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, any>) => void;
    };
  }
}

function trackEvent(eventName: string, eventData?: Record<string, any>) {
  if (window.umami) {
    window.umami.track(eventName, eventData);
  }
}

export function trackRecipeGenerated(
  recipeId: string,
  language: string,
  prompt: string,
  opts?: { hasImage?: boolean },
) {
  trackEvent("recipe-generated", {
    recipeId,
    language,
    promptLength: prompt.length,
    hasImage: opts?.hasImage ?? false,
    timestamp: new Date().toISOString(),
  });
}

export function trackRecipeEdited(
  originalRecipeId: string,
  newRecipeId: string,
  language: string,
  editPrompt: string,
) {
  trackEvent("recipe-remixed", {
    originalRecipeId,
    newRecipeId,
    language,
    editPromptLength: editPrompt.length,
    timestamp: new Date().toISOString(),
  });
}

export function trackRecipeSaved(params: {
  recipeId: string;
  sourceRecipeId: string;
  language: string;
  remixed: boolean;
}) {
  trackEvent("recipe-saved", {
    ...params,
    timestamp: new Date().toISOString(),
  });
}

export function trackRecipeCooked(recipeId: string, language: string) {
  trackEvent("recipe-cooked", {
    recipeId,
    language,
    timestamp: new Date().toISOString(),
  });
}

export function trackRecipeViewed(recipeId: string, language: string, loggedIn: boolean) {
  trackEvent("recipe-viewed", {
    recipeId,
    language,
    loggedIn,
    timestamp: new Date().toISOString(),
  });
}

export function trackGuestLibraryVisit(savedCount: number) {
  trackEvent("guest-library-visited", {
    savedCount,
    hasSavedRecipes: savedCount > 0,
    timestamp: new Date().toISOString(),
  });
}

export function trackPricingSubscribeClick(plan: "premium" | "family", language: string) {
  trackEvent("pricing-subscribe-click", {
    plan,
    language,
    timestamp: new Date().toISOString(),
  });
}

export function trackBookCreated(bookId: string, language: string) {
  trackEvent("book-created", {
    bookId,
    language,
    timestamp: new Date().toISOString(),
  });
}
