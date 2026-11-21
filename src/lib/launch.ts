import type { Lang } from "./i18n";

export const launchText = {
  en: { thankYou: "Thank you for your booking", thankMeta: "Your Onic Car Rentals request has been received. Check your reference and booking status.", notFound: "Page not found", missing: "This page is unavailable. Choose your next destination below.", home: "Home", directions: "Directions", response: "Requests reviewed within minutes or up to 2 hours during business hours.", breadcrumb: "Breadcrumb" },
  pt: { thankYou: "Obrigado pela sua reserva", thankMeta: "Recebemos seu pedido na Onic Car Rentals. Confira sua referência e o status da reserva.", notFound: "Página não encontrada", missing: "Esta página não está disponível. Escolha seu próximo destino abaixo.", home: "Início", directions: "Como chegar", response: "Pedidos analisados em minutos ou em até 2 horas em horário comercial.", breadcrumb: "Navegação" },
  es: { thankYou: "Gracias por tu reserva", thankMeta: "Recibimos tu solicitud en Onic Car Rentals. Consulta tu referencia y el estado de la reserva.", notFound: "Página no encontrada", missing: "Esta página no está disponible. Elige tu próximo destino abajo.", home: "Inicio", directions: "Cómo llegar", response: "Solicitudes revisadas en minutos o en hasta 2 horas durante el horario de atención.", breadcrumb: "Ruta de navegación" },
} satisfies Record<Lang, Record<string, string>>;

export const submittedBooking = (status: string) => ["pending_approval", "approved", "confirmed"].includes(status);
export const directionsUrl = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;