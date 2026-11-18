type GooglePart = string | Record<string, unknown>;

interface GoogleUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
}

function candidates(parts: GooglePart[], finishReason?: string): Record<string, unknown>[] {
  const content = { parts: parts.map(part => (typeof part === 'string' ? { text: part } : part)), role: 'model' };
  return [{ content, ...(finishReason && { finishReason }), index: 0 }];
}

function usageMetadata(usage: GoogleUsage): Record<string, number> {
  return { ...usage, totalTokenCount: usage.promptTokenCount + usage.candidatesTokenCount };
}

/** A non-streamed Google GenAI `generateContent` response. Strings in `parts` become text parts. */
export function googleGenAiResponse({
  parts = ['Mock response from Google GenAI!'],
  usage = { promptTokenCount: 8, candidatesTokenCount: 12 },
}: { parts?: GooglePart[]; usage?: GoogleUsage } = {}): Record<string, unknown> {
  return { candidates: candidates(parts, 'stop'), usageMetadata: usageMetadata(usage) };
}

/**
 * The chunks of a streamed `generateContent` response, one per part. The first chunk names the response;
 * the last one carries the finish reason and usage.
 */
export function googleGenAiStreamChunks({
  parts,
  responseId,
  modelVersion,
  usage = { promptTokenCount: 10, candidatesTokenCount: 12 },
}: {
  parts: GooglePart[];
  responseId: string;
  modelVersion: string;
  usage?: GoogleUsage;
}): Record<string, unknown>[] {
  return parts.map((part, index) => ({
    candidates: candidates([part], index === parts.length - 1 ? 'STOP' : undefined),
    ...(index === 0 && { responseId, modelVersion }),
    ...(index === parts.length - 1 && { usageMetadata: usageMetadata(usage) }),
  }));
}
