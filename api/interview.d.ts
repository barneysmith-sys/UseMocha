export const GEMINI_CURRENT: string;
export const GEMINI_PREVIOUS: string;

export function visibleModelText(data: unknown): string;

export function generationConfigFor(
  model: string,
  options: { json?: boolean; maxOutputTokens?: number; rewrite?: boolean },
): Record<string, unknown>;

export function callGemini(
  prompt: string,
  rid: string,
  options?: {
    json?: boolean;
    rewrite?: boolean;
    maxOutputTokens?: number;
    timeoutMs?: number;
    models?: string[];
  },
): Promise<{
  res: { ok: boolean; status: number; json: () => Promise<unknown> } | null;
  timedOut: boolean;
  networkError?: boolean;
  model: string;
}>;

declare function handler(req: unknown, res: unknown): Promise<void> | void;
export default handler;
