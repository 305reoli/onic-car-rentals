import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Lang } from "@/lib/i18n";

const langRef = vi.hoisted(() => ({ current: "en" as Lang }));

vi.mock("@/hooks/use-lang", async () => {
  const { t } = await import("@/lib/i18n");
  return { useLang: () => ({ lang: langRef.current, tr: t(langRef.current) }) };
});
vi.mock("@/hooks/use-cities", () => ({ useCities: () => [{ slug: "miami", name: "Miami" }] }));
vi.mock("@/lib/queries", () => ({
  settingsQuery: () => ({ queryKey: ["settings"], queryFn: async () => ({}) }),
  citiesQuery: () => ({ queryKey: ["cities"], queryFn: async () => [] }),
  vehiclesQuery: () => ({ queryKey: ["vehicles"], queryFn: async () => [] }),
}));
vi.mock("@/services/reviews.functions", () => ({ getGoogleReviews: async () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}));

const { NoHiddenFeesBadge } = await import("./Conversion");
const { CarCard } = await import("./CarCard");

const EXACT: Record<Lang, string> = {
  pt: "Sem taxas ocultas — o total é o total, você não paga nada a mais.",
  en: "No hidden fees — the total is the total, you pay nothing more.",
  es: "Sin cargos ocultos — el total es el total, no pagas nada más.",
};

const car = {
  id: "c1", slug: "mitsubishi-outlander", name: "Mitsubishi Outlander", brand: "Mitsubishi",
  city: "miami", body_category: "suv", seats: 7, bags: 3, hp: 181,
  daily_price_usd: 99, prereservation_amount_usd: 99, photos: ["/outlander.jpg"],
} as never;

const search = { pickup: "2026-11-17T10:00", ret: "2026-11-20T10:00", loc: "mia" };

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(cleanup);

describe("no-hidden-fees trust badge", () => {
  it.each(["en", "pt", "es"] as const)("shows the owner's exact wording in %s", (lang) => {
    langRef.current = lang;
    renderWithClient(<NoHiddenFeesBadge />);
    expect(screen.getByTestId("no-hidden-fees")).toHaveTextContent(EXACT[lang]);
    expect(screen.getByTestId("no-hidden-fees").querySelector("svg")).not.toBeNull();
  });

  it("preserves the dated search-result total after decluttering", () => {
    langRef.current = "en";
    renderWithClient(<CarCard v={car} search={search} />);
    expect(screen.getByTestId("card-total")).toHaveTextContent("$370.62");
  });
});
