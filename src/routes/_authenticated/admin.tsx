import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Car, CreditCard, MapPin, Percent, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminStatus } from "@/services/admin.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Onic Car Rentals" }, { name: "description", content: "Owner admin." }, { property: "og:title", content: "Admin — Onic Car Rentals" }, { property: "og:description", content: "Owner admin." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Requests", icon: CalendarClock, exact: true },
  { to: "/admin/abandoned", label: "Abandoned checkouts", icon: CalendarClock, exact: false },
  { to: "/admin/cars", label: "Cars", icon: Car, exact: false },
  { to: "/admin/cities", label: "Cities", icon: MapPin, exact: false },
  { to: "/admin/promotions", label: "Promoções e Descontos", icon: Percent, exact: false },
  { to: "/admin/payments", label: "Payments", icon: CreditCard, exact: false },
  { to: "/admin/settings", label: "Settings", icon: Settings, exact: false },
] as const;

function AdminLayout() {
  const status = useServerFn(adminStatus);
  const { data, isLoading } = useQuery({ queryKey: ["admin-status"], queryFn: () => status() });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (isLoading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!data?.isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">This account doesn't have owner access.</p>
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </div>
    );
  }
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/admin" className="flex items-center gap-2 font-display"><Logo /></Link>
          <nav className="hidden gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: n.exact }} className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: "bg-secondary text-foreground" }}>{n.label}</Link>
            ))}
          </nav>
          <button onClick={signOut} className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><LogOut className="size-4" />Sign out</button>
        </div>
        <div className="flex flex-wrap gap-2 px-4 pb-2 text-[11px]">
          {!data.stripeConnected && <span className="rounded-full bg-secondary px-2 py-0.5">Card payments not connected</span>}
          {!data.emailConnected && <span className="rounded-full bg-secondary px-2 py-0.5">{data.emailStatus === "pending" || data.emailStatus === "not_started" ? "Resend connected — domain verification pending" : "Email sending unavailable — check Resend"}</span>}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-border bg-card md:hidden">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} activeOptions={{ exact: n.exact }} className="flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground" activeProps={{ className: "text-primary" }}>
            <n.icon className="size-5" />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
