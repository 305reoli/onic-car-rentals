// Admin view of Global Pays payments tied to site bookings (pure; tested).
export type GpRowInput = {
  id: string; created_at: string; status: string; flow: string; payment_provider: string | null; payment_mode: string | null;
  first_name: string; last_name: string; email?: string | null; vehicle_name: string; is_test?: boolean | null;
  prereservation_amount_usd: number | null; price_breakdown: unknown; paid_amount_usd: number | null;
  payment_method: string | null; gp_amount_brl: number | null; gp_installments: number | null; gp_quote: unknown;
  settled_at: string | null; provider_order_id: string | null; refunded_at?: string | null; gp_refund_due_usd?: number | null;
};
export type GpAdminRow = {
  id: string; reference: string; created_at: string; customer: string; email: string; car: string; test: boolean;
  usd: number | null; paidUsd: number | null; brl: number | null; brlSource: "payment" | "quote" | null;
  method: "Pix" | "Card" | "—"; installments: number | null; status: "pending" | "paid" | "failed" | "refunded";
  kind: "full total" | "historical amount at booking"; orderId: string | null; bookingStatus: string; refundDue: number | null;
};

const PAID = new Set(["pending_approval", "approved", "confirmed", "amount_review", "paid_conflict", "declined", "expired", "cancelled", "completed"]);

export function gpMethod(m: string | null | undefined): GpAdminRow["method"] {
  const x = (m ?? "").toLowerCase();
  if (!x) return "—";
  if (x.includes("pix")) return "Pix";
  if (x.includes("card") || x.includes("cart") || x.includes("credit") || x.includes("créd")) return "Card";
  return "—";
}

export function gpStatus(r: Pick<GpRowInput, "status" | "settled_at" | "refunded_at">): GpAdminRow["status"] {
  if (r.refunded_at || r.status === "refunded") return "refunded";
  if (r.settled_at && PAID.has(r.status)) return "paid";
  if (r.status === "payment_failed") return "failed";
  return "pending";
}

export function gpAdminRows(rows: GpRowInput[]): GpAdminRow[] {
  return rows.filter((r) => r.payment_provider === "globalpays").map((r) => {
    const total = (r.price_breakdown as { total?: number | null } | null)?.total ?? null;
    const full = r.flow !== "gp_request" || r.payment_mode === "full";
    const quote = (r.gp_quote ?? null) as { pix?: { brl?: number } | null; card1x?: { brl?: number } | null } | null;
    const method = gpMethod(r.payment_method);
    const quoted = method === "Card" ? quote?.card1x?.brl : quote?.pix?.brl ?? quote?.card1x?.brl;
    const brl = r.gp_amount_brl != null ? Number(r.gp_amount_brl) : quoted != null ? Number(quoted) : null;
    return {
      id: r.id, reference: r.id.slice(0, 8).toUpperCase(), created_at: r.created_at, customer: `${r.first_name} ${r.last_name}`.trim(),
      email: r.email ?? "", car: r.vehicle_name, test: !!r.is_test,
      usd: full ? total : r.prereservation_amount_usd != null ? Number(r.prereservation_amount_usd) : null,
      paidUsd: r.paid_amount_usd != null ? Number(r.paid_amount_usd) : null,
      brl, brlSource: r.gp_amount_brl != null ? "payment" : quoted != null ? "quote" : null,
      method, installments: r.gp_installments, status: gpStatus(r), kind: full ? "full total" : "historical amount at booking",
      orderId: r.provider_order_id, bookingStatus: r.status, refundDue: r.gp_refund_due_usd != null ? Number(r.gp_refund_due_usd) : null,
    };
  });
}
