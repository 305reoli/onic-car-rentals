import { afterEach, describe, expect, it, vi } from "vitest";
import { attributionFromSearch, attributionSchema, captureAttribution, storedAttribution } from "./attribution";
afterEach(() => vi.unstubAllGlobals());
describe("quote campaign attribution", () => {
  it("captures exactly the five UTM parameters, not unrelated URL data", () => {
    expect(attributionFromSearch("?utm_source=google&utm_medium=cpc&utm_campaign=miami&utm_term=escalade&utm_content=vip&email=private&token=secret")).toEqual({ utm_source: "google", utm_medium: "cpc", utm_campaign: "miami", utm_term: "escalade", utm_content: "vip" });
  });
  it("retains the tagged campaign across untagged navigation", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { sessionStorage: { setItem: (k: string, v: string) => values.set(k, v), getItem: (k: string) => values.get(k) ?? null } });
    captureAttribution("?utm_source=google&utm_campaign=miami"); captureAttribution("");
    expect(storedAttribution()).toEqual({ utm_source: "google", utm_campaign: "miami" });
    captureAttribution("?utm_source=instagram");
    expect(storedAttribution()).toEqual({ utm_source: "instagram" });
  });
  it("bounds values and rejects unknown fields before booking persistence", () => {
    expect(attributionFromSearch("?utm_content=" + "x".repeat(300)).utm_content).toHaveLength(200);
    expect(attributionSchema.safeParse({ utm_source: "google", full_url: "private" }).success).toBe(false);
    expect(attributionSchema.safeParse({ utm_source: "x".repeat(201) }).success).toBe(false);
  });
});
