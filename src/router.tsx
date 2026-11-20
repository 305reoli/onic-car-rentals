import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { publicUrlRewrite } from "@/lib/publicRoutes";
import { RoutePending } from "@/components/site/RoutePending";

/** After a new build, an open tab may request page files that no longer exist; reload once to pick up the new version. */
let reloadStale: () => void = () => {};
const isStaleChunk = (m: unknown) => /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(String(m));
function reloadOnStaleChunk() {
  if (typeof window === "undefined" || (window as { __staleChunkGuard?: boolean }).__staleChunkGuard) return;
  (window as { __staleChunkGuard?: boolean }).__staleChunkGuard = true;
  reloadStale = () => {
    const key = "stale-chunk-reload", last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 30000) return; // never loop
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  };
  window.addEventListener("vite:preloadError", (e) => { e.preventDefault(); reloadStale(); });
  window.addEventListener("unhandledrejection", (e) => { if (isStaleChunk((e.reason as Error)?.message ?? e.reason)) reloadStale(); });
  window.addEventListener("error", (e) => { if (isStaleChunk(e.message)) reloadStale(); });
}

export const getRouter = () => {
  reloadOnStaleChunk();
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    rewrite: publicUrlRewrite,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Start loading a page's data on hover/touch so the tap renders at once.
    defaultPreload: "intent",
    // Slow loads show a page skeleton instead of leaving the old page on screen under the new URL.
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 400,
    defaultPendingMinMs: 250,
    // No view transitions: they freeze the painted page while data loads and can stall in Safari.
  });

  // Hands server-fetched query data to the browser so hydration matches the SSR HTML (no refetch, no re-render).
  setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false });
  // A route whose page file failed to load (stale tab after a new build) reloads once instead of blanking.
  if (typeof window !== "undefined") router.subscribe("onResolved", () => {
    if (router.state.matches.some((m) => m.status === "error" && isStaleChunk((m.error as Error)?.message ?? m.error))) reloadStale();
  });
  return router;
};
