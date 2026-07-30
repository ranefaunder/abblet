import type { BunRequest } from "bun";

export default async function (req: BunRequest): Promise<Response> {
  const url = new URL(req.url);
  const filePath = url.pathname.replace("/static/", "");

  if (filePath.includes("..") || filePath.startsWith("/")) {
    return new Response("Forbidden", { status: 403 });
  }

  const allowedExtensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js", ".ico", ".woff", ".woff2", ".ttf", ".webmanifest", ".json"];
  const hasAllowedExtension = allowedExtensions.some((ext) => filePath.toLowerCase().endsWith(ext));
  if (!hasAllowedExtension) {
    return new Response("Forbidden file type", { status: 403 });
  }

  const fullPath = `./static/${filePath}`;
  const file = Bun.file(fullPath);

  if (await file.exists()) {
    const stats = await file.stat();
    if (stats.size > 10 * 1024 * 1024) {
      return new Response("File too large", { status: 413 });
    }
    const ext = filePath.toLowerCase().split(".").pop() || "";
    const contentTypes: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      webp: "image/webp",
      css: "text/css; charset=utf-8",
      js: "text/javascript; charset=utf-8",
      ico: "image/x-icon",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      webmanifest: "application/manifest+json",
      json: "application/json; charset=utf-8",
    };
    const headers = new Headers();
    const ct = contentTypes[ext];
    if (ct) headers.set("Content-Type", ct);
    // Allow SW under /static/ to control the whole origin (app runtimes live at /{slug}).
    if (filePath === "sw.js" || filePath === "app-runtime-sw.js") {
      headers.set("Service-Worker-Allowed", "/");
      headers.set("Cache-Control", "no-cache");
    }
    // Remiix companion: revalidate so Patch/API updates apply without rebuilding apps.
    if (filePath === "remiix-app.js") {
      headers.set("Cache-Control", "no-cache");
    }
    return new Response(file, { headers });
  }

  return new Response("File not found", { status: 404 });
}
