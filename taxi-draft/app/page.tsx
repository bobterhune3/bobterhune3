import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getBoard } from "@/src/lib/board";
import { PickBoard } from "@/components/pick-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page() {
  await connection();
  const board = await getBoard({ q: "", filter: "All", page: 1 });
  if (board.active === "oifu") redirect("/oifu");
  return <PickBoard initial={board} />;
}
