import { connection } from "next/server";
import { getOifuBoard } from "@/src/lib/board";
import { OifuApp } from "@/components/oifu-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page() {
  await connection();
  const board = await getOifuBoard({ q: "", filter: "All", page: 1 });
  return <OifuApp initial={board} />;
}
