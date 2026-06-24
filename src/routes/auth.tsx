import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import {
  Wallet,
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  User,
  Phone,
  MessageSquare,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { sendPasswordResetCode, verifyPasswordResetCode } from "@/lib/password-reset.functions";
import { startPhoneSignup, verifyPhoneSignup } from "@/lib/sms-signup.functions";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  head: () => ({ meta: [{ title: "Iniciar sesión — Gastos" }] }),
});

const emailSchema = z.string().trim().email("Correo inválido").max(255);
const passwordSchema = z.string().min(6, "Mínimo 6 caracteres").max(72);
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Usa formato internacional, ej. +521234567890");
const nameSchema = z.string().trim().min(2, "Nombre muy corto").max(80);

type SignupStep = "form" | "otp";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [resetStep, setResetStep] = useState<"request" | "verify">("request");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installed, setInstalled] = useState(false);

  // Signup-by-phone flow
  const [step, setStep] = useState<SignupStep>("form");
  const [suFullName, setSuFullName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");

  const startSignup = useServerFn(startPhoneSignup);
  const verifySignup = useServerFn(verifyPhoneSignup);
  const sendResetCode = useServerFn(sendPasswordResetCode);
  const verifyResetCode = useServerFn(verifyPasswordResetCode);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowInstall(true);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setShowInstall(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstallApp() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      toast.success("Instalacion aceptada. Busca Gastos entre tus apps.");
    } else {
      toast("Instalacion cancelada.");
    }
    setDeferredPrompt(null);
    setShowInstall(false);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    const emailParse = emailSchema.safeParse(email);
    const passParse = passwordSchema.safeParse(password);
    if (!emailParse.success) return toast.error(emailParse.error.issues[0].message);
    if (!passParse.success) return toast.error(passParse.error.issues[0].message);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailParse.data,
        password: passParse.data,
      });
      if (error) throw error;
      toast.success("¡Bienvenido!");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg.toLowerCase().includes("invalid login"))
        toast.error("Correo o contraseña incorrectos");
      else toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartSignup(e: React.FormEvent) {
    e.preventDefault();
    const n = nameSchema.safeParse(suFullName);
    const em = emailSchema.safeParse(suEmail);
    const ph = phoneSchema.safeParse(suPhone);
    const pw = passwordSchema.safeParse(suPassword);
    if (!n.success) return toast.error(n.error.issues[0].message);
    if (!em.success) return toast.error(em.error.issues[0].message);
    if (!ph.success) return toast.error(ph.error.issues[0].message);
    if (!pw.success) return toast.error(pw.error.issues[0].message);
    setLoading(true);
    try {
      const res = await startSignup({
        data: { fullName: n.data, email: em.data, phone: ph.data, password: pw.data },
      });
      setPendingId(res.pendingId);
      setStep("otp");
      toast.success(`Te enviamos un código por SMS a ${ph.data}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar SMS");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingId) return;
    if (otp.length !== 6) return toast.error("Ingresa los 6 dígitos");
    setLoading(true);
    try {
      await verifySignup({ data: { pendingId, code: otp } });
      // Auto sign-in
      const { error } = await supabase.auth.signInWithPassword({
        email: suEmail,
        password: suPassword,
      });
      if (error) throw error;
      toast.success("¡Cuenta creada!");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
      setOtp("");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    const n = nameSchema.safeParse(suFullName);
    const em = emailSchema.safeParse(suEmail);
    const ph = phoneSchema.safeParse(suPhone);
    const pw = passwordSchema.safeParse(suPassword);
    if (!n.success || !em.success || !ph.success || !pw.success) return;
    setLoading(true);
    try {
      const res = await startSignup({
        data: { fullName: n.data, email: em.data, phone: ph.data, password: pw.data },
      });
      setPendingId(res.pendingId);
      setOtp("");
      toast.success("Código reenviado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotRequest(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(forgotEmail);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    try {
      await sendResetCode({ data: { email: parsed.data } });
      toast.success("Te enviamos un código por correo.");
      setResetStep("verify");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotVerify(e: React.FormEvent) {
    e.preventDefault();
    const parsedEmail = emailSchema.safeParse(forgotEmail);
    if (!parsedEmail.success) return toast.error(parsedEmail.error.issues[0].message);
    if (!/^\d{6}$/.test(resetCode)) return toast.error("Ingresa un código de 6 dígitos.");
    if (newPassword !== confirmPassword) return toast.error("Las contraseñas no coinciden.");
    const parsedPassword = passwordSchema.safeParse(newPassword);
    if (!parsedPassword.success) return toast.error(parsedPassword.error.issues[0].message);
    setLoading(true);
    try {
      await verifyResetCode({
        data: {
          email: parsedEmail.data,
          code: resetCode,
          password: parsedPassword.data,
        },
      });
      toast.success("Contraseña restablecida.");
      setShowForgot(false);
      setResetStep("request");
      setForgotEmail("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-hero text-white safe-top">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 pb-10 pt-12">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand shadow-soft">
              <Wallet className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
              <p className="text-sm text-white/70">Tu control financiero personal</p>
            </div>
          </div>
          {showInstall && !installed && deferredPrompt ? (
            <Button
              type="button"
              onClick={handleInstallApp}
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Instalar app"
            >
              <Download className="h-5 w-5" />
            </Button>
          ) : null}
        </header>

        <div className="mt-4 rounded-3xl bg-card p-6 text-card-foreground shadow-soft">
          {showForgot ? (
            resetStep === "request" ? (
              <form onSubmit={handleForgotRequest} className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">Recuperar contraseña</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Te enviaremos un código por correo para restablecer tu contraseña.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="femail">Correo</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="femail"
                      type="email"
                      autoComplete="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="pl-10 h-12"
                      placeholder="tu@correo.com"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full bg-gradient-brand text-base font-semibold"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enviar código"}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="block w-full text-sm text-muted-foreground hover:text-foreground"
                >
                  Volver
                </button>
              </form>
            ) : (
              <form onSubmit={handleForgotVerify} className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">Código de recuperación</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ingresa el código enviado a <strong>{forgotEmail}</strong> y tu nueva contraseña.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resetCode">Código</Label>
                  <Input
                    id="resetCode"
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                    className="h-12"
                    placeholder="123456"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nueva contraseña</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-12"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-12"
                    placeholder="Repite la contraseña"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full bg-gradient-brand text-base font-semibold"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Restablecer contraseña"}
                </Button>
                <div className="flex justify-between gap-4 text-sm">
                  <button
                    type="button"
                    onClick={() => setResetStep("request")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Cambiar correo
                  </button>
                  <button
                    type="button"
                    onClick={handleForgotRequest}
                    disabled={loading}
                    className="text-primary hover:underline"
                  >
                    Reenviar código
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgot(false);
                    setResetStep("request");
                  }}
                  className="block w-full text-sm text-muted-foreground hover:text-foreground"
                >
                  Volver
                </button>
              </form>
            )
          ) : (
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as "signin" | "signup");
                setStep("form");
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-6">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-12"
                        placeholder="tu@correo.com"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 h-12"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="h-12 w-full bg-gradient-brand text-base font-semibold"
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        Entrar <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setShowForgot(true);
                    }}
                    className="block w-full text-center text-sm text-primary hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                {step === "form" ? (
                  <form onSubmit={handleStartSignup} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Te enviaremos un código por SMS para verificar tu número.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="suname">Nombre</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="suname"
                          required
                          value={suFullName}
                          onChange={(e) => setSuFullName(e.target.value)}
                          className="pl-10 h-12"
                          placeholder="Tu nombre"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="suemail">Correo</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="suemail"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          required
                          value={suEmail}
                          onChange={(e) => setSuEmail(e.target.value)}
                          className="pl-10 h-12"
                          placeholder="tu@correo.com"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="suphone">Teléfono</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="suphone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          required
                          value={suPhone}
                          onChange={(e) => setSuPhone(e.target.value)}
                          className="pl-10 h-12"
                          placeholder="+521234567890"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Formato internacional con + y código de país.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supass">Contraseña</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="supass"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={suPassword}
                          onChange={(e) => setSuPassword(e.target.value)}
                          className="pl-10 h-12"
                          placeholder="Mínimo 6 caracteres"
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="h-12 w-full bg-gradient-brand text-base font-semibold"
                    >
                      {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <MessageSquare className="mr-2 h-4 w-4" /> Enviar código por SMS
                        </>
                      )}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold">Verifica tu teléfono</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Ingresa el código de 6 dígitos enviado a <b>{suPhone}</b>
                      </p>
                    </div>
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <Button
                      type="submit"
                      disabled={loading || otp.length !== 6}
                      className="h-12 w-full bg-gradient-brand text-base font-semibold"
                    >
                      {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        "Verificar y crear cuenta"
                      )}
                    </Button>
                    <div className="flex items-center justify-between text-sm">
                      <button
                        type="button"
                        onClick={() => setStep("form")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Cambiar datos
                      </button>
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={loading}
                        className="text-primary hover:underline disabled:opacity-50"
                      >
                        Reenviar código
                      </button>
                    </div>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>

        <p className="mt-auto pt-8 text-center text-xs text-white/60">
          Al continuar aceptas nuestros términos y privacidad.
        </p>
      </div>
    </main>
  );
}
