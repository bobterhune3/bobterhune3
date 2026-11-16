import { guard } from "@/src/lib/auth";
import { getSettings, resetDraft, saveSettings, startDraft } from "@/src/lib/board";
import type { TeamRow } from "@/src/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return Response.json(await getSettings());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    passphrase?: string;
    action?: string;
    confirm?: string;
    active?: string;
    season?: number;
    roundsNational?: number;
    roundsAmerican?: number;
    roundsFederal?: number;
    teams?: TeamRow[];
  } | null;
  const denied = guard(request, body?.passphrase);
  if (denied) return denied;
  if (body?.action === "start") {
    const result = await startDraft(request);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result);
  }
  if (body?.action === "reset") {
    if (body.confirm !== "RESET") return Response.json({ error: "Type RESET to wipe the pick history." }, { status: 400 });
    await resetDraft();
    return Response.json({ ok: true });
  }
  const saved = await saveSettings(body ?? {});
  if (!saved.ok) return Response.json({ error: saved.error }, { status: saved.status });
  return Response.json({ ok: true });
}
