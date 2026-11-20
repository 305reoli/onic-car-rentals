import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fieldCls } from "@/components/site/SearchBox";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Owner sign in — Sua Locadora" }, { name: "description", content: "Owner area sign in." }, { property: "og:title", content: "Owner sign in — Sua Locadora" }, { property: "og:description", content: "Owner area." }, { name: "robots", content: "noindex" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ownerExists, setOwnerExists] = useState(true);
  useEffect(() => { supabase.rpc("owner_exists").then(({ data }) => { setOwnerExists(data !== false); if (data === false) setMode("up"); }); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      setBusy(false);
      if (error) return void toast.error(error.message);
      toast.success("Check your email for the password reset link.");
      setMode("in");
      return;
    }
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return void toast.error(error.message);
      navigate({ to: "/admin" });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/admin` } });
      setBusy(false);
      if (error) return void toast.error(error.message);
      if (data.session) navigate({ to: "/admin" });
      else toast.success("Check your email to confirm your account, then sign in.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={submit} className="surface flex w-full max-w-sm flex-col gap-4 p-7">
        <div className="font-display text-xl">BEN <span className="text-primary">RENTAL</span> CAR</div>
        <h1 className="font-display text-2xl">{mode === "in" ? "Owner sign in" : mode === "reset" ? "Reset your password" : "Create owner account"}</h1>
        <input type="email" required placeholder="Email" className={fieldCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        {mode !== "reset" && <input type="password" required minLength={8} placeholder="Password" className={fieldCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />}
        <Button type="submit" size="lg" disabled={busy}>{busy ? "…" : mode === "in" ? "Sign in" : mode === "reset" ? "Send reset link" : "Create account"}</Button>
        {mode === "in" && <button type="button" onClick={() => setMode("reset")} className="cursor-pointer text-sm text-muted-foreground hover:text-primary">Forgot password?</button>}
        {mode === "reset" && <button type="button" onClick={() => setMode("in")} className="cursor-pointer text-sm text-muted-foreground hover:text-primary">Back to sign in</button>}
        {!ownerExists && mode !== "reset" && <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="cursor-pointer text-sm text-muted-foreground hover:text-primary">
          {mode === "in" ? "First time? Create the owner account" : "Already have an account? Sign in"}
        </button>}
        <p className="text-xs text-muted-foreground">{ownerExists ? "Owner access only. New sign-ups are closed." : "Only the first account created becomes the owner. Sign-ups close automatically afterwards."}</p>
      </form>
    </div>
  );
}
