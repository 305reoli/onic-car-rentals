import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const saveFn = vi.fn(async (_a: unknown) => ({ ok: true, emailed: false }));
vi.mock("@tanstack/react-start", async (orig) => ({ ...(await orig<object>()), useServerFn: (f: unknown) => (f === "save" ? saveFn : vi.fn()) }));
vi.mock("@/services/admin.functions", () => ({ updateInsuranceStatus: "save", documentLinks: "links" }));
vi.mock("./resend-email.server", () => ({ sendResendEmail: vi.fn(async () => ({ id: "re_1" })) }));
vi.mock("./whatsapp.server", () => ({ logNotification: vi.fn(async () => undefined) }));

import { MeasureOneCard } from "@/components/site/MeasureOneCard";
import { InsuranceReview } from "@/components/admin/InsuranceReview";
import { insuranceClass, insuranceTransition, MEASUREONE_PENDING } from "@/lib/insurance";
import { insuranceText } from "@/lib/i18n";
import { setInsuranceStatus, type InsuranceDeps } from "./insurance.server";
import { measureOneAfterPayment } from "./measureone-email.server";
import { sendResendEmail } from "./resend-email.server";

const LINK = "https://link.measureone.com/abc";
// State of the booking on the first confirmation screen: paid in full, waiting for owner approval.
const paidPending = { status: "pending_approval", captured_at: "2026-11-18T18:50:35Z", paid_amount_usd: 46.86, prereservation_amount_usd: 46.86, price_breakdown: { total: 46.86 }, refunded_at: null, insurance_us_flow: MEASUREONE_PENDING, insurance_choice: "own" };

describe("1. MeasureOne card on the first confirmation screen", () => {
  it("renders for a paid US MeasureOne-pending booking, opening the link in a new tab", () => {
    render(<MeasureOneCard lang="pt" link={LINK} booking={paidPending as never} />);
    const a = screen.getByRole("link", { name: insuranceText.pt.m1Button });
    expect(a.getAttribute("href")).toBe(LINK);
    expect(a.getAttribute("target")).toBe("_blank");
  });
  it("does not render for non-US, Sua coverage, unpaid or missing link", () => {
    for (const b of [{ ...paidPending, insurance_us_flow: null }, { ...paidPending, insurance_choice: "ben" }, { ...paidPending, status: "draft", captured_at: null, paid_amount_usd: null }]) {
      const { container, unmount } = render(<MeasureOneCard lang="en" link={LINK} booking={b as never} />);
      expect(container.innerHTML).toBe(""); unmount();
    }
    const { container } = render(<MeasureOneCard lang="en" link="" booking={paidPending as never} />);
    expect(container.innerHTML).toBe("");
  });
});

function fakeDb(row: Record<string, unknown>) {
  const tables: Record<string, Record<string, unknown>[]> = { prereservations: [row], settings: [{ id: 1, measureone_static_link: LINK }], vehicles: [], cities: [] };
  const q = (t: string) => {
    const f: ((r: Record<string, unknown>) => boolean)[] = []; let patch: Record<string, unknown> | null = null;
    const rows = () => tables[t]!.filter((r) => f.every((p) => p(r)));
    const api: Record<string, unknown> = {
      select: () => api, update: (p: Record<string, unknown>) => { patch = p; return api; },
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return api; },
      is: (k: string, v: unknown) => { f.push((r) => (r[k] ?? null) === v); return api; },
      maybeSingle: async () => ({ data: rows()[0] ?? null }),
      then: (res: (v: unknown) => void) => { const m = rows(); if (patch) m.forEach((r) => Object.assign(r, patch)); res({ data: m.map((r) => ({ id: r["id"] })), error: null }); },
    };
    return api;
  };
  return { from: q };
}
const booking = (over: Record<string, unknown> = {}) => ({ id: "41ece8c4-3380-4f2d-880d-a9de47baa59f", email: "c@x.com", first_name: "Ana", language: "pt", vehicle_name: "Audi A3", vehicle_id: null, measureone_email_sent_at: null, settled_at: null, ...paidPending, ...over });

describe("2. MeasureOne email fires at payment time", () => {
  it("sends exactly once for a paid US MeasureOne-pending booking still awaiting approval (Stripe/Global Pays request)", async () => {
    vi.mocked(sendResendEmail).mockClear();
    const db = fakeDb(booking());
    expect(await measureOneAfterPayment(db, booking().id)).toEqual({ sent: true });
    expect(await measureOneAfterPayment(db, booking().id)).toEqual({ sent: false, reason: "already_sent" });
    expect(vi.mocked(sendResendEmail)).toHaveBeenCalledTimes(1);
  });
  it("does not send for non-US, Sua coverage or unpaid bookings", async () => {
    vi.mocked(sendResendEmail).mockClear();
    for (const over of [{ insurance_us_flow: null }, { insurance_choice: "ben" }, { status: "draft", captured_at: null, paid_amount_usd: null }]) await measureOneAfterPayment(fakeDb(booking(over)), booking().id);
    expect(vi.mocked(sendResendEmail)).not.toHaveBeenCalled();
  });
});

describe("3. Admin insurance status for MeasureOne bookings", () => {
  it("shows the status dropdown + save button and saves the chosen status", async () => {
    render(<InsuranceReview r={{ id: booking().id, documents: {}, insurance_choice: "own", insurance_status: null, insurance_us_flow: MEASUREONE_PENDING, vehicle: { body_category: "suv", category: "exotic" } }} />);
    fireEvent.change(screen.getByLabelText(insuranceText.en.status), { target: { value: "verified" } });
    fireEvent.click(screen.getByRole("button", { name: insuranceText.en.save }));
    await waitFor(() => expect(saveFn).toHaveBeenCalledWith({ data: { id: booking().id, status: "verified", reason: null } }));
  });
  it("persists the status on the booking without a file; non-MeasureOne without a file is still refused", async () => {
    const saved: unknown[] = [];
    const deps: InsuranceDeps = { load: async () => ({ id: "x", email: "c@x.com", first_name: null, vehicle_name: "Audi A3", language: "en", documents: {}, insurance_status: null, insurance_us_flow: MEASUREONE_PENDING, insurance_choice: "own" }), save: async (_i, p) => { saved.push(p); }, send: vi.fn(), log: vi.fn() };
    await setInsuranceStatus(deps, "x", "verified");
    expect(saved[0]).toMatchObject({ insurance_status: "verified", insurance_denial_reason: null });
    expect(() => insuranceTransition({ hasFile: false, status: null }, "verified")).toThrow("NO_INSURANCE_FILE");
  });
});

describe("4. Category-aware insurance minimums", () => {
  it("an Audi A3 (SUV body, stale legacy 'exotic' tier) is Regular: 10/10 + PD US$10k, deductible ≤ US$2,000", () => {
    expect(insuranceClass({ body_category: "suv", category: "exotic" })).toBe("regular");
    const row = insuranceText.en.rows.regular[1];
    expect(row).toContain("10/10"); expect(row).toContain("property damage US$10k"); expect(row).toContain("up to US$2,000"); expect(row).toContain("collision and comprehensive");
  });
  it("maps the other classes per the owner's table", () => {
    expect(insuranceClass({ body_category: "suv", category: "luxury_suv" })).toBe("luxury");
    expect(insuranceClass({ body_category: "luxury" })).toBe("luxury");
    expect(insuranceClass({ body_category: "sports" })).toBe("sports");
    expect(insuranceClass({ body_category: "exotics" })).toBe("exotics");
    expect(insuranceText.en.rows.luxury[1]).toContain("25/50");
    expect(insuranceText.en.rows.sports[1]).toContain("100/300");
    expect(insuranceText.en.rows.exotics[1]).toContain("50/50");
  });
  it("the admin card highlights the Regular row for the Audi A3", () => {
    render(<InsuranceReview r={{ id: "y", documents: {}, insurance_choice: "own", insurance_us_flow: MEASUREONE_PENDING, vehicle: { body_category: "suv", category: "exotic" } }} />);
    const bold = screen.getByText(insuranceText.en.rows.regular[0]).closest("tr")!;
    expect(bold.className).toContain("font-semibold");
  });
});
