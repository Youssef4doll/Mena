import "server-only";
import { prisma } from "./prisma";
import { getSecrets, getSettings } from "./settings";
import { intlPhone } from "./phone";

/**
 * SMS and e-mail to customers. Every message is written to Notification
 * first, so the back office shows what was sent — and what could not be,
 * when no gateway is configured, so it can be sent by hand on WhatsApp.
 *
 * SMS goes through any plain HTTP gateway (Tunisian SMS providers all offer
 * one): the URL, method and body are templates with {to}, {text}, {sender}
 * and {key} filled in. No provider is hard-wired.
 */
export async function sendSms(args: { to: string; text: string; kind: string; orderId?: string }) {
  const [settings, secrets] = await Promise.all([getSettings(), getSecrets()]);
  const n = await prisma.notification.create({
    data: { channel: "SMS", to: args.to, body: args.text, kind: args.kind, orderId: args.orderId, status: "QUEUED" },
  });
  const tpl = settings.notify.smsUrl;
  if (!tpl) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: "NOT_CONFIGURED" } });
    return;
  }
  const fill = (s: string, enc: boolean) =>
    s
      .replaceAll("{to}", enc ? encodeURIComponent(intlPhone(args.to)) : intlPhone(args.to))
      .replaceAll("{text}", enc ? encodeURIComponent(args.text) : JSON.stringify(args.text).slice(1, -1))
      .replaceAll("{sender}", enc ? encodeURIComponent(settings.notify.smsSender) : settings.notify.smsSender)
      .replaceAll("{key}", enc ? encodeURIComponent(secrets.smsKey) : secrets.smsKey);
  try {
    const url = fill(tpl, true);
    const res =
      settings.notify.smsMethod === "GET"
        ? await fetch(url, { signal: AbortSignal.timeout(8000) })
        : await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: fill(settings.notify.smsBody || '{"to":"{to}","text":"{text}"}', false),
            signal: AbortSignal.timeout(8000),
          });
    await prisma.notification.update({
      where: { id: n.id },
      data: res.ok ? { status: "SENT" } : { status: "FAILED", error: `HTTP ${res.status}` },
    });
  } catch (e) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: "FAILED", error: String(e).slice(0, 300) } });
  }
}

export async function sendEmail(args: { to: string; subject: string; text: string; kind: string; orderId?: string }) {
  const [settings, secrets] = await Promise.all([getSettings(), getSecrets()]);
  const n = await prisma.notification.create({
    data: { channel: "EMAIL", to: args.to, body: `${args.subject}\n\n${args.text}`, kind: args.kind, orderId: args.orderId },
  });
  if (!secrets.resendKey || !settings.notify.emailFrom) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: "NOT_CONFIGURED" } });
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${secrets.resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: settings.notify.emailFrom, to: [args.to], subject: args.subject, text: args.text }),
      signal: AbortSignal.timeout(8000),
    });
    await prisma.notification.update({ where: { id: n.id }, data: res.ok ? { status: "SENT" } : { status: "FAILED", error: `HTTP ${res.status}` } });
  } catch (e) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: "FAILED", error: String(e).slice(0, 300) } });
  }
}
