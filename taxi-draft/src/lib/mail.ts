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

export function onePerManager(rows: { manager: string; email: string }[]): string[] {
  const seenManagers = new Set<string>();
  const seenEmails = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const manager = row.manager.trim().toLowerCase();
    const email = row.email.trim();
    const emailKey = email.toLowerCase();
    if (!manager || !email.includes("@") || seenManagers.has(manager) || seenEmails.has(emailKey)) continue;
    seenManagers.add(manager);
    seenEmails.add(emailKey);
    out.push(email);
  }
  return out;
}

export async function sendMail(to: string[], subject: string, text: string): Promise<string> {
  const user = process.env.GMAIL_USER?.trim() ?? "";
  const pass = process.env.GMAIL_APP_PASSWORD?.trim() ?? "";
  if (!user || !pass) return "Gmail is not configured.";
  const unique = [...new Set(to.map((item) => item.trim()).filter((item) => item.includes("@")))];
  if (unique.length === 0) return "No manager email addresses are saved.";
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });
  const errors: string[] = [];
  for (const address of unique) {
    try {
      await transport.sendMail({ from: user, to: address, subject, text });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email failed.";
      errors.push(message.replaceAll(pass, "[redacted]"));
    }
  }
  return errors.join(" ").slice(0, 300);
}
