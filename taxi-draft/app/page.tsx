import { connection } from "next/server";
import { getBoard } from "@/src/lib/board";
import { PickBoard } from "@/components/pick-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page() {
  await connection();
  const board = await getBoard({ q: "", filter: "All", page: 1 });
  return <PickBoard initial={board} />;
}
