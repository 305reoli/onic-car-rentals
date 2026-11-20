// Shared pickup/return state + live delivery quote for the car page booking card and checkout (same server rules).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { quoteDelivery } from "@/services/delivery.functions";
import { previewLegs, type OptionPrices } from "@/lib/deliveryPreview";
import { mcoRoundTripFree, sameCityDeliveryOnly, type DeliveryCar, type DeliveryLeg } from "@/lib/pricing";

export function useDeliveryQuote(vehicle: DeliveryCar & { id: string }, svcCity: string, init: { pickup: DeliveryLeg; ret: DeliveryLeg; same: boolean }) {
  const [pickupLeg, setPickupLeg] = useState<DeliveryLeg>(init.pickup);
  const [returnLeg, setReturnLeg] = useState<DeliveryLeg>(init.ret);
  const [sameReturn, setSameReturn] = useState(init.same);
  type DQ = Awaited<ReturnType<typeof quoteDelivery>>;
  const [dq, setDq] = useState<DQ | null>(null);
  const [dqBusy, setDqBusy] = useState(false);
  const quoteFn = useServerFn(quoteDelivery);
  const deliveryChoice = { type: pickupLeg.type, pickupLeg, returnLeg, sameReturn };
  const choiceKey = JSON.stringify(deliveryChoice);
  useEffect(() => {
    let live = true; setDq(null); setDqBusy(true);
    quoteFn({ data: { vehicleId: vehicle.id, serviceCity: svcCity, delivery: deliveryChoice } })
      .then(r => { if (live) setDq(r); }).catch(() => { if (live) setDq({ ok: false, error: "DELIVERY_PRICE", optionPrices: {} }); }).finally(() => { if (live) setDqBusy(false); });
    return () => { live = false; };
  }, [choiceKey, svcCity]); // eslint-disable-line react-hooks/exhaustive-deps
  const dOk = dq && dq.ok ? dq : null;
  // Fixed per-leg fees show (and count in the total) as soon as an option is picked; the server quote then confirms them.
  const [optPrices, setOptPrices] = useState<OptionPrices>({});
  useEffect(() => { if (dq && "optionPrices" in dq && dq.optionPrices && Object.keys(dq.optionPrices).length) setOptPrices(dq.optionPrices); }, [dq]);
  const retLeg = sameReturn ? pickupLeg : returnLeg;
  const preview = previewLegs({ pickup: pickupLeg, ret: retLeg, prices: optPrices, carCity: vehicle.city, sameCityOnly: sameCityDeliveryOnly(vehicle) });
  const shownLegs = dOk?.legs ?? (!dq || (!dq.ok && dq.error === "DELIVERY_ADDRESS") ? preview.legs : null);
  const deliveryFee = dOk ? dOk.itemizedFee : shownLegs ? preview.fee : 0;
  const deliveryPending = dOk ? dOk.status === "quote_pending" : !!shownLegs && preview.pending;
  const mcoFree = mcoRoundTripFree(vehicle.city, pickupLeg, retLeg);
  return { pickupLeg, setPickupLeg, returnLeg, setReturnLeg, sameReturn, setSameReturn, dq, dqBusy, dOk, optPrices, shownLegs, deliveryFee, deliveryPending, deliveryChoice, mcoFree };
}

/** Car page → checkout hand-off of the Step 1 locations (server re-validates everything). */
export const encodeLegs = (p: DeliveryLeg, r: DeliveryLeg, same: boolean) => JSON.stringify({ p: strip(p), r: strip(r), s: same });
const strip = (l: DeliveryLeg) => ({ city: l.city, type: l.type, ...(l.address ? { address: l.address } : {}), ...(l.placeId ? { placeId: l.placeId } : {}), ...(l.type === "airport" && l.flightAirline ? { flightAirline: String(l.flightAirline).slice(0, 80) } : {}), ...(l.type === "airport" && l.flightNumber ? { flightNumber: String(l.flightNumber).slice(0, 20) } : {}) });
const TYPES = ["pickup", "airport", "address"] as const;
const legOk = (x: unknown): x is DeliveryLeg => !!x && typeof x === "object" && typeof (x as DeliveryLeg).city === "string" && (TYPES as readonly string[]).includes((x as DeliveryLeg).type);
export function decodeLegs(raw: string | undefined): { pickup: DeliveryLeg; ret: DeliveryLeg; same: boolean } | null {
  if (!raw) return null;
  try { const o = JSON.parse(raw) as { p?: unknown; r?: unknown; s?: unknown }; if (!legOk(o.p) || !legOk(o.r)) return null; return { pickup: strip(o.p), ret: strip(o.r), same: o.s !== false }; } catch { return null; }
}
