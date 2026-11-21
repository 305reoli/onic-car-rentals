import { z } from "zod";
import { storedDocsComplete } from "@/lib/identity";
import { luggageLogisticsSchema, hotelLogisticsSchema, childSeatsSchema } from "@/lib/checkoutExtras";

/** How the customer gets the car. The fee is NEVER sent by the client — the server computes it. */
export const deliveryLegSchema = z.object({ city: z.string().refine(c => ["orlando", "miami", "tampa", "fort-lauderdale"].includes(c)), type: z.enum(["pickup", "airport", "address"]), address: z.string().trim().max(300).optional(), sessionToken: z.string().uuid().optional(), placeId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/).optional(), flightAirline: z.string().trim().max(80).optional(), flightNumber: z.string().trim().max(20).optional() }).strict();
export const deliverySchema = z.object({
  pickupLeg: deliveryLegSchema.optional(),
  returnLeg: deliveryLegSchema.optional(),
  sameReturn: z.boolean().optional(),
  type: z.enum(["pickup", "airport", "address"]),
  airportMode: z.enum(["one_way", "round_trip"]).optional(),
  mode: z.enum(["delivery", "collection", "both"]).optional(),
  address: z.string().trim().max(300).optional(),
  destinationCity: z.string().trim().min(1).max(60).optional(),
}).strict();
export type DeliveryChoice = z.infer<typeof deliverySchema>;

/** First additional driver is free (no price line). Files are JPEG/PNG only (site document policy). */
export const additionalDriverSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  licenseFront: z.string().regex(/^uploads\/[0-9a-f-]{36}\/addLicenseFront\.(jpg|jpeg|png)$/),
  licenseBack: z.string().regex(/^uploads\/[0-9a-f-]{36}\/addLicenseBack\.(jpg|jpeg|png)$/),
  passport: z.string().regex(/^uploads\/[0-9a-f-]{36}\/addPassport\.(jpg|jpeg|png)$/),
});
export type AdditionalDriver = z.infer<typeof additionalDriverSchema>;
export const createSchema = z.object({
  captureToken: z.string().uuid().optional(),
  vehicleSlug: z.string(), city: z.string(), serviceCity: z.string().optional(),
  pickupAt: z.string(), returnAt: z.string(),
  pickupLocation: z.string().optional(), returnLocation: z.string().optional(),
  delivery: deliverySchema,
  addons: z.object({ insurance: z.boolean(), hotelCheckin: z.boolean(), luggageCar: z.boolean(), babySeat: z.boolean().optional(), childSeats: childSeatsSchema.optional(), coverage: z.boolean().optional(), prepaidFuel: z.boolean().optional(), vipDelivery: z.boolean().optional(), luggageLogistics: luggageLogisticsSchema.optional(), hotelLogistics: hotelLogisticsSchema.optional(), fees: z.array(z.string().max(64)).max(20).optional() }).superRefine((a, ctx) => {
    if (a.babySeat && !a.childSeats) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Child seat ages required", path: ["childSeats"] });
  }).transform((a) => ({ ...a, insurance: false, coverage: false, childSeats: a.babySeat ? a.childSeats : undefined })).superRefine((a, ctx) => {
    if (a.luggageCar && !a.luggageLogistics) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Luggage logistics required", path: ["luggageLogistics"] });
    if (a.hotelCheckin && !a.hotelLogistics) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Hotel logistics required", path: ["hotelLogistics"] });
  }),
  driver: z.object({
    firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(200), phone: z.string().trim().regex(/^\+\d[\d\s()-]{6,20}$/),
    country: z.string().trim().min(1).max(80), dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    address: z.string().trim().min(1).max(300), flightNumber: z.string().trim().max(20).optional(),
    licenseNumber: z.string().max(100).optional(), licenseExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), passportNumber: z.string().max(100).optional(),
  }),
  documents: z.object({ folder: z.string().regex(/^uploads\/[0-9a-f-]{36}$/), licenseFront: z.string().min(1), licenseBack: z.string().min(1), passport: z.string().min(1), secondLicense: z.string().optional(), insurancePolicy: z.string().regex(/^uploads\/[0-9a-f-]{36}\/insurancePolicy\.(pdf|jpg|jpeg|png|heic|heif)$/).optional(), additionalDriver: additionalDriverSchema.optional() }).optional(),
  whatsappOptIn: z.boolean(),
  language: z.enum(["en", "pt", "es"]),
});
export type BookingInput = z.infer<typeof createSchema>;
export const REQUIRED_DOCS = ["licenseFront", "licenseBack", "passport"] as const;

/** Stored documents JSON (empty until the customer uploads them after payment). */
export const docsRow = (d: BookingInput["documents"]) => d ? { licenseFront: d.licenseFront, licenseBack: d.licenseBack, passport: d.passport, ...(d.secondLicense ? { secondLicense: d.secondLicense } : {}), ...(d.insurancePolicy ? { insurancePolicy: d.insurancePolicy } : {}), ...(d.additionalDriver ? { additionalDriver: { fullName: d.additionalDriver.fullName.trim(), licenseFront: d.additionalDriver.licenseFront, licenseBack: d.additionalDriver.licenseBack, passport: d.additionalDriver.passport } } : {}) } : {};
/** Every stored path must live in the upload folder (additional driver included). */
export const docsInFolder = (d: { folder: string; licenseFront: string; licenseBack: string; passport: string; secondLicense?: string | undefined; insurancePolicy?: string | undefined; additionalDriver?: { licenseFront: string; licenseBack: string; passport: string } | undefined }) =>
  [d.licenseFront, d.licenseBack, d.passport, d.secondLicense, d.insurancePolicy, d.additionalDriver?.licenseFront, d.additionalDriver?.licenseBack, d.additionalDriver?.passport].filter(Boolean).every((p) => (p as string).startsWith(`${d.folder}/`));
/** True when a stored booking has the three required documents. */
export const hasRequiredDocs = (docs: unknown, identity?: unknown) => storedDocsComplete(docs, identity);
