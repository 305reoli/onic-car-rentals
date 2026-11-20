/** Text hints identify a destination; the managed cities table remains the selectable/valid city list. */
export function detectDeliveryCity(address: string): string | null {
  const text = address.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hints: [string, RegExp][] = [
    ["fort-lauderdale", /\b(?:fort[\s-]+lauderdale|ft\.?\s+lauderdale|fll|port everglades|las olas)\b/],
    ["tampa", /\b(?:tampa|tpa|water street|amalie arena|busch gardens)\b/],
    ["orlando", /\b(?:orlando|mco|walt disney world|disney springs|universal orlando)\b/],
    ["miami", /\b(?:miami|mia|brickell|south beach|portmiami)\b/],
  ];
  for (const [city, re] of hints) if (re.test(text)) return city;
  const zip = text.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  if (zip?.startsWith("336")) return "tampa";
  if (zip?.startsWith("333")) return "fort-lauderdale";
  if (zip?.startsWith("328")) return "orlando";
  if (zip?.startsWith("331")) return "miami";
  return null;
}

export function deliveryDestination(fallback: string, choice: { type: string; address?: string | undefined; destinationCity?: string | undefined; pickupLeg?: { city: string } | undefined }): string {
  if (choice.pickupLeg) return fallback === "tampa" ? "orlando" : fallback === "fort-lauderdale" ? "miami" : fallback;
  return choice.type === "address" ? choice.destinationCity || detectDeliveryCity(choice.address ?? "") || fallback : fallback;
}