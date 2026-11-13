interface ToolCallKeyState {
  calls: Map<string, { id?: string }>;
  keyByIndex: Map<number, string>;
  lastKey?: string;
}

/**
 * Find the key of the call a tool call delta belongs to. A numeric `index` groups deltas, except that a different
 * non-empty `id` arriving on an index that is already taken opens a new call (a known `id` continues its own call).
 * Some providers omit the index and send each parallel call whole: a known `id` continues that call, a new `id` (or
 * a name without an id) starts a new call, and anything else continues the latest one.
 */
export function getToolCallKey(
  toolCall: { index?: number | null; id?: string },
  name: string | undefined,
  accumulator: ToolCallKeyState,
): string {
  const { calls } = accumulator;
  const findById = (id: string): string | undefined => {
    for (const [key, call] of calls) {
      if (call.id === id) return key;
    }
    return undefined;
  };

  if (typeof toolCall.index === 'number') {
    const key = accumulator.keyByIndex.get(toolCall.index) ?? `index-${toolCall.index}`;
    const known = toolCall.id ? findById(toolCall.id) : undefined;
    if (known !== undefined) {
      accumulator.keyByIndex.set(toolCall.index, known);
      return known;
    }
    const existingId = calls.get(key)?.id;
    if (existingId && toolCall.id && existingId !== toolCall.id) {
      const next = findById(toolCall.id) ?? `index-${toolCall.index}-${calls.size}`;
      accumulator.keyByIndex.set(toolCall.index, next);
      return next;
    }
    return key;
  }
  if (toolCall.id) {
    const known = findById(toolCall.id);
    if (known !== undefined) {
      return known;
    }
  }
  if (toolCall.id || name || accumulator.lastKey === undefined) {
    return `no-index-${calls.size}`;
  }
  return accumulator.lastKey;
}
