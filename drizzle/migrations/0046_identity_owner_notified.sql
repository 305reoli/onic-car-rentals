ALTER TABLE public.identity_verifications ADD COLUMN IF NOT EXISTS owner_notified_at timestamptz;
ALTER TABLE public.identity_verifications ADD COLUMN IF NOT EXISTS booking_id uuid;
CREATE INDEX IF NOT EXISTS identity_verifications_booking_idx ON public.identity_verifications(booking_id);