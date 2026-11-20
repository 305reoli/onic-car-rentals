import { useRouterState } from "@tanstack/react-router";

/** Thin top bar while a page change is loading, so a tap always gives instant feedback. */
export function NavProgress() {
  const loading = useRouterState({ select: (s) => s.status === "pending" || s.isLoading });
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden transition-opacity duration-200 ${loading ? "opacity-100" : "opacity-0"}`} data-testid="nav-progress" data-loading={loading ? "true" : "false"}>
      <div className="nav-progress-bar h-full w-1/3 bg-primary" />
    </div>
  );
}

/** Shown in place of a page whose data is still loading after a short delay (never on the first server render). */
export function RoutePending() {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-7xl px-5 py-10" data-testid="route-pending">
      <div className="h-10 w-2/3 max-w-xl animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_380px]">
        <div className="aspect-[3/2] animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}
