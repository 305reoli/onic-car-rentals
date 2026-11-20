export type BookingSearch = { city?: string | undefined; loc?: string | undefined; pickup?: string | undefined; ret?: string | undefined; type?: string | undefined; similarTo?: string | undefined };

export const bookingSearch = (s: Record<string, unknown>): BookingSearch => ({
  similarTo: typeof s["similarTo"] === "string" ? s["similarTo"] : undefined,
  type: typeof s["type"] === "string" ? s["type"] : undefined,
  city: typeof s["city"] === "string" ? s["city"] : undefined,
  loc: typeof s["loc"] === "string" ? s["loc"] : undefined,
  pickup: typeof s["pickup"] === "string" ? s["pickup"] : undefined,
  ret: typeof s["ret"] === "string" ? s["ret"] : undefined,
});
