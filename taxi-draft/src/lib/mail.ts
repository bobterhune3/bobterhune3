import nodemailer from "nodemailer";
import type { Slot } from "./order";
import type { PickRow } from "./types";

export function mailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

export function messageFor(slot: Slot, history: PickRow[], pageUrl: string): { subject: string; text: string } {
  const subject = `${slot.team.manager}'s turn to pick in the Taxi Squad Draft`;
  const lines = [
    `Pick ${slot.pick}, Round ${slot.round}`,
    pageUrl,
    "",
    `${slot.team.manager}'s turn. ${slot.team.name}.`,
    "",
    history.length ? "Picks so far" : "No picks yet.",
    ...history
      .slice()
      .sort((a, b) => a.pick - b.pick)
      .map((pick) => `${pick.pick}. ${pick.team}, ${pick.manager}, ${pick.name}, ${pick.pos}`),
  ];
  return { subject, text: lines.join("\n") };
}

export async function sendMail(to: string[], subject: string, text: string): Promise<string> {
  const user = process.env.GMAIL_USER?.trim() ?? "";
  const pass = process.env.GMAIL_APP_PASSWORD?.trim() ?? "";
  if (!user || !pass) return "Gmail is not configured.";
  const unique = [...new Set(to.map((item) => item.trim()).filter((item) => item.includes("@")))];
  if (unique.length === 0) return "No manager email addresses are saved.";
  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user, pass },
    });
    await transport.sendMail({ from: user, to: unique, subject, text });
    return "";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email failed.";
    return message.replaceAll(pass, "[redacted]").slice(0, 300);
  }
}
