import { describe, it, expect, beforeEach } from "vitest";
import { trackFunnel, resetFunnelForTests } from "./funnel";

describe("booking funnel events", () => {
  beforeEach(() => { resetFunnelForTests(); const w = globalThis as unknown as { window: Record<string, unknown> }; w.window = { __metaPixel: "ok" }; });
  it("sends each step once to GA4 and Meta with its exact name", () => {
    const g: unknown[][] = [], f: unknown[][] = [];
    const w = (globalThis as unknown as { window: Record<string, unknown> }).window;
    w["gtag"] = (...a: unknown[]) => g.push(a); w["fbq"] = (...a: unknown[]) => f.push(a);
    expect(trackFunnel("payment_step_viewed", { car: "corolla", total: 298.2 }, "k")).toBe(true);
    expect(trackFunnel("payment_step_viewed", { car: "corolla", total: 298.2 }, "k")).toBe(false);
    expect(g).toEqual([["event", "payment_step_viewed", { car: "corolla", total: 298.2 }]]);
    expect(f).toEqual([["trackCustom", "payment_step_viewed", { car: "corolla", total: 298.2 }]]);
  });
});
