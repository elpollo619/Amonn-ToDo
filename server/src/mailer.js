// ============================================================
// Envío de emails (avisos por correo). Usa SMTP; para Gmail basta con el
// correo y una "contraseña de aplicación" (Google → Seguridad → Verificación
// en dos pasos → Contraseñas de aplicaciones).
// Si no hay SMTP_USER/SMTP_PASS, los avisos por email quedan desactivados y
// el resto de la app funciona igual.
// ============================================================
import nodemailer from 'nodemailer'
import { config } from './config.js'

let transporter = null

function getTransporter() {
  if (transporter) return transporter
  const { host, port, user, pass } = config.mail
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  return transporter
}

export function mailEnabled() {
  return config.mail.enabled
}

/** Envía un email de texto plano. Lanza error si falla. */
export async function sendEmail(to, subject, text) {
  if (!mailEnabled()) {
    console.log(`[mail] (desactivado) a ${to}: ${subject}`)
    return false
  }
  await getTransporter().sendMail({
    from: `"Amonn" <${config.mail.from}>`,
    to,
    subject,
    text,
  })
  return true
}
