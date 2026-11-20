ALTER TABLE public.prereservations
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sistemagestao_status text,
  ADD COLUMN IF NOT EXISTS sistemagestao_link text,
  ADD COLUMN IF NOT EXISTS sistemagestao_error text,
  ADD COLUMN IF NOT EXISTS sistemagestao_synced_at timestamptz;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS balance_deadline_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS whatsapp_provider text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS msg_approved_en text NOT NULL DEFAULT 'Your Sua Locadora reservation [code] for [car], [pickup] – [return] in [city], has been APPROVED. To complete it, please sign your rental agreement and pay the remaining balance of $[balance] online: [link]. Payment deadline: [deadline].',
  ADD COLUMN IF NOT EXISTS msg_approved_pt text NOT NULL DEFAULT 'Sua reserva Sua Locadora [code] do [car], [pickup] – [return] em [city], foi APROVADA. Para concluir, assine seu contrato de aluguel e pague o saldo restante de $[balance] online: [link]. Prazo de pagamento: [deadline].',
  ADD COLUMN IF NOT EXISTS msg_approved_es text NOT NULL DEFAULT 'Tu reserva de Sua Locadora [code] del [car], [pickup] – [return] en [city], ha sido APROBADA. Para completarla, firma tu contrato de alquiler y paga el saldo restante de $[balance] en línea: [link]. Fecha límite de pago: [deadline].',
  ADD COLUMN IF NOT EXISTS msg_declined_en text NOT NULL DEFAULT 'Sorry — your Sua Locadora request [code] for [car] ([pickup] – [return], [city]) could not be confirmed. Your card hold has been released. Other cars are available: [link]',
  ADD COLUMN IF NOT EXISTS msg_declined_pt text NOT NULL DEFAULT 'Desculpe — seu pedido Sua Locadora [code] do [car] ([pickup] – [return], [city]) não pôde ser confirmado. O bloqueio no seu cartão foi liberado. Outros carros disponíveis: [link]',
  ADD COLUMN IF NOT EXISTS msg_declined_es text NOT NULL DEFAULT 'Lo sentimos — tu solicitud de Sua Locadora [code] del [car] ([pickup] – [return], [city]) no pudo confirmarse. La retención en tu tarjeta fue liberada. Otros autos disponibles: [link]',
  ADD COLUMN IF NOT EXISTS msg_expired_en text NOT NULL DEFAULT 'Your Sua Locadora pre-reservation [code] for [car] ([pickup] – [return], [city]) has expired and the card hold was released. You can request again: [link]',
  ADD COLUMN IF NOT EXISTS msg_expired_pt text NOT NULL DEFAULT 'Sua pré-reserva Sua Locadora [code] do [car] ([pickup] – [return], [city]) expirou e o bloqueio no cartão foi liberado. Você pode pedir novamente: [link]',
  ADD COLUMN IF NOT EXISTS msg_expired_es text NOT NULL DEFAULT 'Tu pre-reserva de Sua Locadora [code] del [car] ([pickup] – [return], [city]) expiró y la retención fue liberada. Puedes solicitar de nuevo: [link]',
  ADD COLUMN IF NOT EXISTS wa_tpl_approved_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wa_tpl_approved_pt text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wa_tpl_approved_es text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wa_tpl_declined_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wa_tpl_declined_pt text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wa_tpl_declined_es text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wa_tpl_expired_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wa_tpl_expired_pt text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wa_tpl_expired_es text NOT NULL DEFAULT '';

GRANT SELECT ON public.settings TO anon, authenticated;
GRANT UPDATE ON public.settings TO authenticated;

CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  prereservation_id uuid,
  channel text NOT NULL,
  kind text NOT NULL,
  recipient text NOT NULL DEFAULT '',
  status text NOT NULL,
  detail text NOT NULL DEFAULT ''
);
GRANT SELECT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads notification log" ON public.notification_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));