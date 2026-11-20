import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modelScarcityQuery } from "@/lib/scarcityQuery";
import { Scarcity } from "./Scarcity";

const calls = vi.hoisted(() => ({ metrics: vi.fn(), hold: vi.fn() }));
vi.mock("@/services/scarcity.functions", () => ({ getModelScarcity: calls.metrics, getCheckoutStockHold: calls.hold }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const id = "fc14f176-a78e-4f40-8d21-9c1009947d04", pickup = "2026-11-17T10:00", ret = "2026-11-21T10:00";
describe("scarcity hydration across public locales", () => {
  it.each(["en", "pt", "es"] as const)("hydrates and reads the real dated count on both surfaces in %s", async lang => {
    calls.metrics.mockResolvedValue({ units: 1, booked: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await client.ensureQueryData(modelScarcityQuery(id, pickup, ret));
    render(<QueryClientProvider client={client}><Scarcity vehicleId={id} pickup={pickup} ret={ret} lang={lang} /><Scarcity vehicleId={id} pickup={pickup} ret={ret} lang={lang} /></QueryClientProvider>);
    await waitFor(() => expect(calls.metrics).toHaveBeenCalledWith({ data: { vehicleId: id, pickup, ret } }));
    expect(client.getQueryData(modelScarcityQuery(id, pickup, ret).queryKey)).toEqual({ units: 1, booked: null });
    client.clear();
  });
  it("rechecks changed dates across locales rather than reusing the old count", async () => {
    calls.metrics.mockImplementation(async ({ data }: { data: { ret: string } }) => ({ units: data.ret === ret ? 1 : 2, booked: null }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (r: string) => <QueryClientProvider client={client}><Scarcity vehicleId={id} pickup={pickup} ret={r} lang="pt" /></QueryClientProvider>;
    const { rerender } = render(ui(ret));
    await waitFor(() => expect(client.getQueryData(modelScarcityQuery(id, pickup, ret).queryKey)).toEqual({ units: 1, booked: null }));
    rerender(ui("2026-11-22T10:00"));
    await waitFor(() => expect(client.getQueryData(modelScarcityQuery(id, pickup, "2026-11-22T10:00").queryKey)).toEqual({ units: 2, booked: null }));
    client.clear();
  });
  it("replaces a previous count with unknown after a failed refresh", async () => {
    calls.metrics.mockResolvedValueOnce({ units: 1, booked: null }).mockRejectedValue(new Error("unavailable"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const options = modelScarcityQuery(id, pickup, ret);
    await client.fetchQuery(options);
    expect(client.getQueryData(options.queryKey)).toEqual({ units: 1, booked: null });
    await act(async () => { await client.fetchQuery(options); });
    expect(client.getQueryData(options.queryKey)).toEqual({ units: null, booked: null });
    client.clear();
  });
});