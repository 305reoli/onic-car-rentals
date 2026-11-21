import { SealIntro } from "@/components/brand/SealIntro";
import { settingsQuery } from "@/lib/queries";
import { businessAddresses, googleProfileUrl, orgJsonLd } from "@/lib/seo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { useMotion } from "@/components/site/Motion";
import { META_PIXEL_HEAD, metaTrack } from "@/lib/metaPixel";
import { NotFoundPage } from "@/components/site/NotFoundPage";

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({ context }) => {
    const st = await context.queryClient.ensureQueryData(settingsQuery()).catch(() => null);
    const x = st as { delivery_config?: { bases?: Record<string, { address: string }> }; google_business_url?: string; google_place_id?: string | null } | null;
    return { addresses: businessAddresses(x?.delivery_config?.bases), googleUrl: googleProfileUrl(x?.google_business_url, x?.google_place_id) };
  },
  head: ({ loaderData }) => ({
    scripts: [{ type: "application/ld+json", children: JSON.stringify(orgJsonLd(loaderData?.addresses ?? businessAddresses(null), undefined, loaderData?.googleUrl)) }],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Onic Car Rentals" },
      { property: "og:site_name", content: "Onic Car Rentals" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#FFFFFF" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "64x64" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..112,400..700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const lang = /^\/en(?:\/|$)/.test(path) ? "en" : /^\/es(?:\/|$)/.test(path) ? "es" : "pt-BR";
  return (
    <html lang={lang}>
      <head>
        {/* Dev preview only: define the React refresh hooks before any module runs (the dev bundler sets them too late, which broke hydration and in-app navigation in preview). Not rendered in production. */}
        {import.meta.env.DEV && <script dangerouslySetInnerHTML={{ __html: "window.$RefreshReg$=window.$RefreshReg$||function(){};window.$RefreshSig$=window.$RefreshSig$||function(){return function(t){return t}};" }} />}
        <HeadContent />
        <script async src="https://app.promptado.com/v1/analytics.js?key=pk_749d7c48574781f89431ea74ec212b03"></script>
        {/* Meta Pixel (base code + PageView), loaded only outside consent regions */}
        <script dangerouslySetInnerHTML={{ __html: META_PIXEL_HEAD }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useMotion();
  useEffect(() => {
    // Auth client is loaded after hydration so public pages don't ship it in their first-paint JS.
    let unsub: (() => void) | undefined; let dead = false;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (dead) return;
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      unsub = () => data.subscription.unsubscribe();
    });
    return () => { dead = true; unsub?.(); };
  }, [router, queryClient]);
  useEffect(() => {
    // Meta PageView on every in-app navigation (the first load's PageView fires from the head base code).
    let last = router.state.location.href;
    return router.subscribe("onResolved", (ev) => {
      const href = ev.toLocation.href;
      if (href === last) return;
      last = href;
      metaTrack("PageView");
    });
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster />
      <SealIntro />
    </QueryClientProvider>
  );
}
