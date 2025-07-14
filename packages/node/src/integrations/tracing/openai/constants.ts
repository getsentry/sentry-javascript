export const INTEGRATION_NAME = 'OpenAI';

// Easy to extend method list
export const INSTRUMENTED_METHODS = [
  'responses.create',
  'chat.completions.create',
  // Future additions:
  // 'embeddings.create',
  // 'images.generate',
  // 'audio.transcriptions.create',
  // 'moderations.create',
] as const;

export type InstrumentedMethod = typeof INSTRUMENTED_METHODS[number];