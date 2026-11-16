import { guard } from "@/src/lib/auth";
import { replaceRoster } from "@/src/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Upload a roster file." }, { status: 400 });
  const denied = guard(request, String(form.get("passphrase") ?? ""));
  if (denied) return denied;
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a roster file." }, { status: 400 });
  const result = await replaceRoster(Buffer.from(await file.arrayBuffer()), form.get("replace") === "1");
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
