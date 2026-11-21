# Project rules
- Campaign attribution is validated from five UTM tags, retained per browser tab and stored in reservation price_breakdown; no full landing URLs or new schema are needed.
- Discovery schema uses public vehicle facts as Car/Offer; unknown specs and dated availability claims are omitted.
- Visitor actions queue GTM dataLayer events without an account ID, while native project events fire at existing user actions; no analytics accounts are fabricated.
- Render localized rental instructions and usage notices from the shared i18n dictionary through HowItWorks so the home and instructions pages stay aligned.
- Booking notifications contain rental-related actions only; the shared email shell supplies the canonical phone and separate WhatsApp contact so all notification kinds share working contact links.
- Site wordmarks use the shared Logo component backed by public/logo.png; email seals remain separate so site branding never changes notification assets.
- Fleet CRUD writes directly to vehicles; availability uses local blocked dates and booking overlaps only, so rental and admin flows do not require an external sync service.
- Keep the historical manually-processed booking lock local to payment finalization to prevent duplicate processing after retiring integrations.
- Launch page trails use the matched route metadata; thank-you pages read submitted booking status and reuse the shared purchase deduplication, so navigation never fabricates a conversion or changes payment settlement.
