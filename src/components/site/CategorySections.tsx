import { useState, type ReactNode } from "react";
import { useLang } from "@/hooks/use-lang";
import { inCategory, PUBLIC_CATEGORIES, type Vehicle } from "@/lib/vehicles";
import { cn } from "@/lib/utils";

/** Sticky category chips with counts; "All" shows one section per category in fixed order, empty ones hidden. */
export function CategorySections({ vehicles, render, order }: { vehicles: Vehicle[]; render: (cars: Vehicle[]) => ReactNode; order?: readonly string[] | undefined }) {
  const { tr } = useLang();
  const [cat, setCat] = useState<string>("all");
  const sections = (order ?? PUBLIC_CATEGORIES).map((c) => ({ c, cars: vehicles.filter((v) => inCategory(v, c)) })).filter((s) => s.cars.length);
  const shown = cat === "all" ? sections : sections.filter((s) => s.c === cat);
  return (
    <div>
      <div className="no-scrollbar sticky top-[121px] z-20 -mx-5 mb-8 flex gap-2 overflow-x-auto bg-background/90 px-5 py-3 backdrop-blur">
        {[{ c: "all", n: vehicles.length }, ...sections.map((s) => ({ c: s.c, n: s.cars.length }))].map(({ c, n }) => (
          <button key={c} onClick={() => setCat(c)}
            className={cn("shrink-0 cursor-pointer rounded-full border px-5 py-2 text-sm transition-colors",
              cat === c ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            {c === "all" ? tr.fleet.all : tr.categories[c as "suv"]} <span className="opacity-60">{n}</span>
          </button>
        ))}
      </div>
      {shown.map(({ c, cars }) => (
        <section key={c} className="mb-14">
          <h3 className="font-display mb-6 border-b border-border pb-3 text-2xl text-primary">{tr.categories[c as "suv"]}</h3>
          {render(cars)}
        </section>
      ))}
    </div>
  );
}
