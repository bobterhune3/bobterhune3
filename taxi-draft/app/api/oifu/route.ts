import { guard } from "@/src/lib/auth";
import { actOifu } from "@/src/lib/oifu";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { action?: string; mlbid?: string; abbrs?: string[]; passphrase?: string } | null;
  const denied = guard(request, body?.passphrase);
  if (denied) return denied;
  const result = await actOifu(body ?? {});
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true, mailError: result.mailError });
}
