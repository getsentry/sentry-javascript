import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';
import { openAiCompatibleConfig } from './openai-compatible';

// `together-ai` is a Stainless-generated, OpenAI-compatible SDK — see `openAiCompatibleConfig`.
export const togetherAiConfig = openAiCompatibleConfig({
  name: 'together-ai',
  versionRange: '>=0.6.0 <1',
}) satisfies InstrumentationConfig[];

export const togetherAiModuleNames = getModuleNames(togetherAiConfig);

export const togetherAiChannels = {
  TOGETHER_CHAT: 'orchestrion:together-ai:chat',
  TOGETHER_EMBEDDINGS: 'orchestrion:together-ai:embeddings',
} as const;
