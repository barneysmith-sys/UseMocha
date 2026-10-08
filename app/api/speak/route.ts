import handler from "../../../api/speak.js";
import { runNodeHandler } from "@/lib/server/nodeHandler";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return runNodeHandler(handler, request);
}

export function OPTIONS(request: Request) {
  return runNodeHandler(handler, request);
}
