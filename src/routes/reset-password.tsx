import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fieldCls } from "@/components/site/SearchBox";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Sua Locadora" }, { name: "description", content: "Set a new owner account password." }, { property: "og:title", content: "Reset password — Sua Locadora" }, { property: "og:description", content: "Owner area." }, { name: "robots", content: "noindex" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The recovery link lands here with #access_token=...&type=recovery; the
    // client verifies it from the URL and fires PASSWORD_RECOVERY. getSession()
    // resolves only after that URL detection, so a valid link yields a recovery
    // session while a bogus or expired one yields none.
    let cancelled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setState("ready");
    });
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setState(session ? "ready" : "invalid");
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return void toast.error("Passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Password updated.");
    navigate({ to: "/admin" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      {state === "checking" ? (
        <div className="surface flex w-full max-w-sm flex-col gap-4 p-7">
          <div className="font-display text-xl">BEN <span className="text-primary">RENTAL</span> CAR</div>
          <p className="text-sm text-muted-foreground">Checking your reset link…</p>
        </div>
      ) : state === "ready" ? (
        <form onSubmit={submit} className="surface flex w-full max-w-sm flex-col gap-4 p-7">
          <div className="font-display text-xl">BEN <span className="text-primary">RENTAL</span> CAR</div>
          <h1 className="font-display text-2xl">Set a new password</h1>
          <input type="password" required minLength={8} placeholder="New password" className={fieldCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          <input type="password" required minLength={8} placeholder="Confirm new password" className={fieldCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          <Button type="submit" size="lg" disabled={busy}>{busy ? "…" : "Update password"}</Button>
        </form>
      ) : (
        <div className="surface flex w-full max-w-sm flex-col gap-4 p-7">
          <div className="font-display text-xl">BEN <span className="text-primary">RENTAL</span> CAR</div>
          <h1 className="font-display text-2xl">Reset link invalid or expired</h1>
          <p className="text-sm text-muted-foreground">Request a new password reset link from the sign-in page.</p>
          <Link to="/auth" className="text-sm text-primary hover:underline">Back to sign in</Link>
        </div>
      )}
    </div>
  );
}
