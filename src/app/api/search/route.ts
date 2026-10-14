import { NextResponse } from "next/server";
import { searchSecurities } from "@/services/securities";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").slice(0, 40);
  const remote = searchParams.get("remote") === "1";
  if (!q.trim()) return NextResponse.json({ results: [] });
  const results = await searchSecurities(q, { remote });
  return NextResponse.json({ results });
}
