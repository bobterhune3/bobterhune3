import { guard } from "@/src/lib/auth";
import { resendEmail } from "@/src/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { passphrase?: string; pickNumber?: number } | null;
  const denied = guard(request, body?.passphrase);
  if (denied) return denied;
  const result = await resendEmail(Number(body?.pickNumber), request);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true });
}
