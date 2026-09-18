import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';
import { openAiCompatibleConfig } from './openai-compatible';

// `groq-sdk` is a Stainless-generated, OpenAI-compatible SDK — see `openAiCompatibleConfig`.
export const groqConfig = openAiCompatibleConfig({
  name: 'groq-sdk',
  versionRange: '>=0.3.0 <2',
}) satisfies InstrumentationConfig[];

export const groqModuleNames = getModuleNames(groqConfig);

export const groqChannels = {
  GROQ_CHAT: 'orchestrion:groq-sdk:chat',
  GROQ_EMBEDDINGS: 'orchestrion:groq-sdk:embeddings',
} as const;
