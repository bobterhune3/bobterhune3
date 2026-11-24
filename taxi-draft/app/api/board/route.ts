import { getBoard, getOifuBoard } from "@/src/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const filter = url.searchParams.get("filter") ?? "All";
  const q = url.searchParams.get("q") ?? "";
  const draft = url.searchParams.get("draft") === "oifu" ? "oifu" : "taxi";
  const input = {
    q: q.slice(0, 40),
    filter: ["All", "SP", "SW", "RP", "C", "1B", "2B", "3B", "SS", "OF"].includes(filter) ? filter : "All",
    page: Number.isFinite(page) ? page : 1,
  };
  const board = draft === "oifu" ? await getOifuBoard(input) : await getBoard(input);
  return Response.json(board);
}
