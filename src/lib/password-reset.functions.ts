import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomInt, randomUUID } from "crypto";
import nodemailer from "nodemailer";

const sendSchema = z.object({
  email: z.string().trim().email().max(255),
});

const verifySchema = z.object({
  email: z.string().trim().email().max(255),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(6).max(72),
});

function hashCode(code: string, salt: string) {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

function getTransporter() {
  const SMTP_HOST = process.env.SMTP_HOST;
  const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const EMAIL_FROM = process.env.EMAIL_FROM;
  const SMTP_SECURE = process.env.SMTP_SECURE === "true";

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
    throw new Error(
      "Email no configurado. Agrega SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y EMAIL_FROM al entorno.",
    );
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE || SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

async function sendEmail(to: string, subject: string, text: string, html?: string) {
  const transporter = getTransporter();
  const EMAIL_FROM = process.env.EMAIL_FROM!;

  const result = await transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html,
  });

  if (!result.accepted || result.accepted.length === 0) {
    throw new Error("No se pudo enviar el correo de recuperación.");
  }
}

export const sendPasswordResetCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: users, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw new Error(listErr.message);

    const user = users.users.find(
      (u) => u.email?.toLowerCase() === data.email.toLowerCase(),
    );
    if (!user || !user.id) {
      throw new Error("No existe una cuenta con ese correo.");
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const salt = randomUUID();
    const codeHash = hashCode(code, salt);

    const { error } = await supabaseAdmin
      .from("password_reset_requests")
      .insert({
        user_id: user.id,
        email: data.email.toLowerCase(),
        code_hash: `${salt}:${codeHash}`,
      });
    if (error) throw new Error(error.message);

    const text = `Tu código para restablecer contraseña es ${code}. Expira en 10 minutos.`;
    const html = `<p>Tu código para restablecer contraseña es <strong>${code}</strong>.</p><p>Expira en 10 minutos.</p>`;

    await sendEmail(data.email, "Código de restablecimiento de contraseña", text, html);

    return { message: "Código enviado. Revisa tu correo." };
  });

export const verifyPasswordResetCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => verifySchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pending, error: selectErr } = await supabaseAdmin
      .from("password_reset_requests")
      .select("id, user_id, email, code_hash, attempts, expires_at, used_at")
      .eq("email", data.email.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (selectErr) throw new Error(selectErr.message);
    if (!pending) throw new Error("Código incorrecto o expirado.");
    if (pending.used_at) throw new Error("Este código ya fue usado.");
    if (new Date(pending.expires_at).getTime() < Date.now())
      throw new Error("El código expiró. Solicita uno nuevo.");
    if (pending.attempts >= 5) throw new Error("Demasiados intentos. Solicita un nuevo código.");

    const [salt, expected] = String(pending.code_hash).split(":");
    const got = hashCode(data.code, salt);
    if (got !== expected) {
      await supabaseAdmin
        .from("password_reset_requests")
        .update({ attempts: pending.attempts + 1 })
        .eq("id", pending.id);
      throw new Error("Código incorrecto.");
    }

    if (!pending.user_id) throw new Error("Usuario no encontrado.");

    const { data: updated, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      pending.user_id,
      {
        password: data.password,
      },
    );
    if (updateErr) throw new Error(updateErr.message);

    await supabaseAdmin
      .from("password_reset_requests")
      .update({ used_at: new Date().toISOString() })
      .eq("id", pending.id);

    return { message: "Contraseña actualizada." };
  });
