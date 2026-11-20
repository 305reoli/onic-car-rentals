// Model search: accent/case-insensitive match on name, brand and model, with common nicknames.
// Used by the sticky search typeahead and the /{lang}/search results page.

export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const ALIASES: Record<string, string> = {
  lambo: "lamborghini", lamb: "lamborghini", rolls: "rolls royce", rr: "rolls royce", merc: "mercedes", benz: "mercedes",
  mb: "mercedes", vette: "corvette", gwagon: "g63", "g wagon": "g63", chevy: "chevrolet", landrover: "land rover", rangerover: "range rover",
  caddy: "cadillac", beemer: "bmw", bimmer: "bmw",
};

type Searchable = { name: string; brand?: string | null; model?: string | null };

function expand(q: string): string {
  let n = normalize(q);
  for (const [k, v] of Object.entries(ALIASES)) n = n.replace(new RegExp(`(^| )${k}( |$)`, "g"), `$1${v}$2`);
  return n;
}

/** Every query word must be the start of some word in the car's name/brand/model (or appear inside it). */
export function matchesCar(v: Searchable, query: string): boolean {
  const q = expand(query);
  if (!q) return false;
  const hay = normalize(`${v.name} ${v.brand ?? ""} ${v.model ?? ""}`);
  const words = hay.split(" ");
  const compact = hay.replace(/ /g, "");
  return q.split(" ").every((t) => words.some((w) => w.startsWith(t)) || (t.length >= 3 && compact.includes(t)));
}

export function searchCars<T extends Searchable>(cars: T[], query: string): T[] {
  return cars.filter((v) => matchesCar(v, query));
}

/** Closest category suggestion for a query with no car match (keywords per category). */
const CATEGORY_HINTS: Record<string, string[]> = {
  suv: ["suv", "jeep", "family", "familia", "7", "van", "truck", "pickup", "camioneta"],
  sedan: ["sedan", "seda", "berlina"],
  luxury: ["luxury", "luxo", "lujo", "rolls", "bentley", "maybach"],
  convertible: ["convertible", "conversivel", "cabrio", "spider", "spyder", "roadster"],
  sports: ["sport", "sports", "esportivo", "deportivo", "mustang", "camaro", "porsche"],
  exotics: ["exotic", "exotico", "supercar", "ferrari", "mclaren", "lamborghini"],
};
export function suggestCategory(query: string): string {
  const q = normalize(query);
  for (const [cat, keys] of Object.entries(CATEGORY_HINTS)) if (keys.some((k) => q.includes(k))) return cat;
  return "exotics";
}
