import { createHash, timingSafeEqual } from "node:crypto";

export function passphraseConfigured(): boolean {
  return (process.env.DRAFT_PASSPHRASE ?? "").trim().length > 0;
}

export function passphraseOk(given: string | null | undefined): boolean {
  const expected = (process.env.DRAFT_PASSPHRASE ?? "").trim();
  if (!expected || !given) return false;
  const a = createHash("sha256").update(expected, "utf8").digest();
  const b = createHash("sha256").update(given, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function readPassphrase(request: Request): string {
  return request.headers.get("x-draft-passphrase") ?? "";
}

export function unauthorized(): Response {
  const message = passphraseConfigured()
    ? "That passphrase is not right."
    : "Add DRAFT_PASSPHRASE before changing the draft.";
  return Response.json({ error: message }, { status: passphraseConfigured() ? 401 : 403 });
}

export function guard(request: Request, bodyPassphrase?: string): Response | null {
  const given = bodyPassphrase || readPassphrase(request);
  if (!passphraseOk(given)) return unauthorized();
  return null;
}
