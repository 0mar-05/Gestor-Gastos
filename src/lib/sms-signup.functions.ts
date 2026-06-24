import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomInt } from "crypto";

const startSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(255),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Teléfono inválido (formato E.164, ej. +521234567890)"),
  password: z.string().min(6).max(72),
});

const verifySchema = z.object({
  pendingId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

function hashCode(code: string, salt: string) {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGE_SERVICE_SID;
  if (!sid || !token || !messagingServiceSid) throw new Error("SMS no configurado");

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, MessagingServiceSid: messagingServiceSid, Body: body }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Twilio error", res.status, text);
    let msg = "No se pudo enviar el SMS";
    try {
      const j = JSON.parse(text) as { message?: string; code?: number };
      if (j.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export const startPhoneSignup = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => startSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reject if email or phone already used in auth.users
    const { data: existing, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw new Error(listErr.message);
    const dup = existing.users.find(
      (u) =>
        (u.email && u.email.toLowerCase() === data.email.toLowerCase()) ||
        u.phone === data.phone.replace(/^\+/, ""),
    );
    if (dup) throw new Error("Ya existe una cuenta con ese correo o teléfono");

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const salt = crypto.randomUUID();
    const codeHash = hashCode(code, salt);

    const { data: inserted, error } = await supabaseAdmin
      .from("pending_registrations")
      .insert({
        full_name: data.fullName,
        email: data.email,
        phone: data.phone,
        password: data.password,
        code_hash: `${salt}:${codeHash}`,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await sendSms(
      data.phone,
      `Tu código de verificación para Gastos: ${code}. Expira en 10 minutos.`,
    );

    return { pendingId: inserted.id as string };
  });

export const verifyPhoneSignup = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => verifySchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pending, error } = await supabaseAdmin
      .from("pending_registrations")
      .select("id, full_name, email, phone, password, code_hash, attempts, expires_at, used_at")
      .eq("id", data.pendingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pending) throw new Error("Registro no encontrado. Inicia de nuevo.");
    if (pending.used_at) throw new Error("Este código ya fue usado");
    if (new Date(pending.expires_at).getTime() < Date.now())
      throw new Error("El código expiró. Solicita uno nuevo.");
    if (pending.attempts >= 5) throw new Error("Demasiados intentos. Solicita un nuevo código.");

    const [salt, expected] = String(pending.code_hash).split(":");
    const got = hashCode(data.code, salt);
    if (got !== expected) {
      await supabaseAdmin
        .from("pending_registrations")
        .update({ attempts: pending.attempts + 1 })
        .eq("id", pending.id);
      throw new Error("Código incorrecto");
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: pending.email,
      password: pending.password,
      phone: pending.phone,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { full_name: pending.full_name },
    });
    if (createErr) throw new Error(createErr.message);

    await supabaseAdmin
      .from("pending_registrations")
      .update({ used_at: new Date().toISOString() })
      .eq("id", pending.id);

    return { email: pending.email, userId: created.user?.id ?? null };
  });
