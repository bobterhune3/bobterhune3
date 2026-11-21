import { guard } from "@/src/lib/auth";
import { refreshCache } from "@/src/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { passphrase?: string } | null;
  const denied = guard(request, body?.passphrase);
  if (denied) return denied;
  const result = await refreshCache();
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
