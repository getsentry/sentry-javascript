/** A non-streamed Google GenAI `generateContent` response. A string `parts` becomes one text part. */
export function googleGenAiResponse({
  parts = 'Mock response from Google GenAI!',
  finishReason = 'stop',
  usage = { promptTokenCount: 8, candidatesTokenCount: 12 },
  modelVersion,
}: {
  parts?: string | Record<string, unknown>[];
  finishReason?: string;
  usage?: { promptTokenCount: number; candidatesTokenCount: number };
  modelVersion?: string;
} = {}): Record<string, unknown> {
  return {
    candidates: [
      {
        content: { parts: typeof parts === 'string' ? [{ text: parts }] : parts, role: 'model' },
        finishReason,
        index: 0,
      },
    ],
    ...(modelVersion && { modelVersion }),
    usageMetadata: { ...usage, totalTokenCount: usage.promptTokenCount + usage.candidatesTokenCount },
  };
}
