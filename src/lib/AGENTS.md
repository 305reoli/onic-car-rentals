# Library rules
- Search result eligibility and price order use resultPricing.ts with effectiveMinDays/rentalDays and datedTotal, so displayed totals, date limits and sorting share existing pricing without changing records or deduplicating units.

- Publication policy copy is centralized in `ownerText`/`cancellationPolicy` in i18n; car mileage and factual specs use vehicles helpers to keep pages and FAQ aligned.
- `qualifiesCancellationGrace` in rentalTerms is a tested publication-policy predicate only; it never executes refunds or changes the payment lifecycle.
- Missing regular deposits resolve through `withDepositDefault` on public reads and admin form initialization; existing deposits and shared database remain untouched until an owner saves, preserving preview-only rollout.
- Deductible helpers (`insuranceDeductible`) stay for admin only; no public page, FAQ or Terms renders a deductible (pinned by no-deductible.test.ts).- Extra-mile price uses `extraMilePrice` in vehicles.ts: per-unit `vehicles.extra_mile_price_usd` else the standard US$ 7; Terms/FAQ blanket wording stays generic.
- Discounts live only in computeQuote (pricing.ts): per day, December full price, else max(tier from `settings.duration_tiers`, in-window `vehicle_promotions` %) — never stacked; promos reach quotes via `s.promotions` (getPublicSettings / server loaders); surfaces use `durationLabel`/`promoLabels`/`rentalRateText`, and cards never show discounted rates.
- Funnel steps use `trackFunnel`; paid purchase events use `trackPurchase` (funnel.ts), one persisted transaction claim shared across confirmation pages, so names and deduplication stay consistent.
- Owner super deals live only in `SUPER_DEALS` (pricing.ts): fixed rate on one unit for days in the window, only when booked (`bookedAt`, NY calendar) by `bookBy`; listed DB price untouched so syncs cannot erase it, and PriceTag/PromoTicker read the same entry.
