import handler from "../../../api/callback.js";
import { runNodeHandler } from "@/lib/server/nodeHandler";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return runNodeHandler(handler, request);
}

export function POST(request: Request) {
  return runNodeHandler(handler, request);
}
