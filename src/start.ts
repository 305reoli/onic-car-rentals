import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { cookieValue, detectLang } from "@/lib/langDetect";
import { legacyOldSiteRedirect, legacyPtRedirect, publicPath } from "@/lib/publicRoutes";
import { legacyCarTarget } from "@/lib/aeo";
import { legacyCheckoutRedirect } from "@/lib/checkoutRecovery";

const publicLanguageMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  if (["/", "/pt", "/en", "/es"].includes(url.pathname) && [...url.searchParams.keys()].some(key => /^carros-\d+$/.test(key))) {
    const { readActivePublicCars } = await import("@/services/public-catalog.server");
    const { publicClient } = await import("@/services/public-client.server");
    const [cars, cityResult] = await Promise.all([readActivePublicCars(), publicClient().from("cities").select("slug, fleet_from_city").eq("active", true)]);
    if (cityResult.error) throw cityResult.error;
    const target = legacyCarTarget(url, cars, cityResult.data ?? []);
    if (target) return new Response(null, { status: 301, headers: { Location: target } });
  }
  const oldCheckout = legacyCheckoutRedirect(url.pathname, url.search);
  if (oldCheckout) return new Response(null, { status: 301, headers: { Location: oldCheckout } });
  const oldSite = legacyOldSiteRedirect(url.pathname);
  if (oldSite) return new Response(null, { status: 301, headers: { Location: oldSite + url.search } });
  const legacy = legacyPtRedirect(url.pathname);
  if (legacy) return new Response(null, { status: 301, headers: { Location: legacy + url.search } });
  if (url.pathname === "/") {
    const h = request.headers;
    const lang = detectLang({ cookie: cookieValue(h.get("cookie"), "lang"), acceptLanguage: h.get("accept-language"), country: h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country"), userAgent: h.get("user-agent") });
    if (lang !== "pt") return new Response(null, { status: 302, headers: { Location: publicPath(lang) + url.search, Vary: "Accept-Language, Cookie, User-Agent", "Cache-Control": "private, no-store" } });
    const result = await next();
    result.response.headers.set("Vary", "Accept-Language, Cookie, User-Agent");
    result.response.headers.set("Cache-Control", "private, no-store");
    return result;
  }
  return next();
});

// Basic hardening headers; no X-Frame-Options/frame-ancestors because the editor preview embeds the site in an iframe.
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const h = result.response.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(self)");
  return result;
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware, csrfMiddleware, publicLanguageMiddleware],
}));
