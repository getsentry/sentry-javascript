import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';
import { openAiCompatibleConfig } from './openai-compatible';

// `together-ai` is a Stainless-generated, OpenAI-compatible SDK — see `openAiCompatibleConfig`.
export const togetherAiConfig = [
  ...openAiCompatibleConfig({ name: 'together-ai', versionRange: '>=0.6.0 <1' }),
  // 1.x defines `create` on `BaseCompletions`/`BaseEmbeddings`; `Completions`/`Embeddings` are empty subclasses.
  ...openAiCompatibleConfig(
    { name: 'together-ai', versionRange: '>=1.0.0 <2' },
    { chat: 'BaseCompletions', embeddings: 'BaseEmbeddings' },
  ),
] satisfies InstrumentationConfig[];

export const togetherAiModuleNames = getModuleNames(togetherAiConfig);

export const togetherAiChannels = {
  TOGETHER_CHAT: 'orchestrion:together-ai:chat',
  TOGETHER_EMBEDDINGS: 'orchestrion:together-ai:embeddings',
} as const;
