ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS company_zip text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS support_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_company_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS legal_operator_en text NOT NULL DEFAULT 'Sua Locadora is a brand operated by Sua Empresa LLC, a Florida limited liability company.',
  ADD COLUMN IF NOT EXISTS legal_operator_pt text NOT NULL DEFAULT 'A Sua Locadora é uma marca operada pela Sua Empresa LLC, uma sociedade de responsabilidade limitada da Flórida.',
  ADD COLUMN IF NOT EXISTS legal_operator_es text NOT NULL DEFAULT 'Sua Locadora es una marca operada por Sua Empresa LLC, una sociedad de responsabilidad limitada de Florida.',
  ADD COLUMN IF NOT EXISTS legal_payments_en text NOT NULL DEFAULT 'Online pre-reservation payments made through Stripe for Sua Locadora bookings are processed and received by Sua Empresa LLC.',
  ADD COLUMN IF NOT EXISTS legal_payments_pt text NOT NULL DEFAULT 'Os pagamentos online de pré-reserva feitos via Stripe para as reservas da Sua Locadora são processados e recebidos pela Sua Empresa LLC.',
  ADD COLUMN IF NOT EXISTS legal_payments_es text NOT NULL DEFAULT 'Los pagos en línea de prerreserva realizados a través de Stripe para las reservas de Sua Locadora son procesados y recibidos por Sua Empresa LLC.';