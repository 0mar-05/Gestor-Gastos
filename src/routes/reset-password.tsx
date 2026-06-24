import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
  head: () => ({ meta: [{ title: "Restablecer contraseña — Gastos" }] }),
});

const passwordSchema = z.string().min(6, "Mínimo 6 caracteres").max(72);

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Recovery flow: Supabase sets a temporary session from the link hash.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (password !== confirm) return toast.error("Las contraseñas no coinciden");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data });
      if (error) throw error;
      toast.success("Contraseña actualizada");
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-hero text-white safe-top">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 pb-10">
        <div className="rounded-3xl bg-card p-6 text-card-foreground shadow-soft">
          <h1 className="text-xl font-semibold">Nueva contraseña</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ready ? "Crea una contraseña nueva para tu cuenta." : "Validando enlace…"}
          </p>
          {ready && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="np">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="np"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-12"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp">Confirmar</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="cp"
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pl-10 h-12"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="h-12 w-full bg-gradient-brand font-semibold"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Guardar contraseña"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
