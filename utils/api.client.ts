import type { ApiResult } from "/types/api-types";

/** `fetch` + parsittu `ApiResult<T>` + HTTP `status` (`Response.status`, 0 jos verkko kaatui ennen vastausta).
 * Merkkijonorungolle oletus `Content-Type: application/json` jos otsikkoa ei annettu. */
export async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<ApiResult<T>> {
  let res: Response;

  try {
    let fetchInit = init;
    if (init?.body != null && typeof init.body === "string") {
      const headers = new Headers(init.headers);
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
        fetchInit = { ...init, headers };
      }
    }
    res = await fetch(input, {
      ...fetchInit,
      credentials: fetchInit?.credentials ?? "same-origin",
    });
  } catch {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: "Network request failed",
      },
      status: 0,
    };
  }

  const status = res.status;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Server returned invalid JSON",
      },
      status,
    };
  }

  if (
    !json ||
    typeof json !== "object" ||
    !("success" in json)
  ) {
    return {
      success: false,
      error: {
        code: "INVALID_API_RESPONSE",
        message: "Unexpected response shape",
      },
      status,
    };
  }

  const body = json as Record<string, unknown>;
  if (typeof body.status !== "number") {
    return { ...body, status } as ApiResult<T>;
  }
  return json as ApiResult<T>;
}
