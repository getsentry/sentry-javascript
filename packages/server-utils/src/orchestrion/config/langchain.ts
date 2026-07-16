import type { InstrumentationConfig } from '..';

// `@langchain/*` packages ship dual CJS/ESM builds (`.cjs` for `require`, `.js` for `import`) and the
// matcher compares `filePath` exactly, so each hook is declared once per built file.

// LangChain's chat model methods live on `BaseChatModel` in `@langchain/core` and are inherited by
// every provider class (`ChatAnthropic`, `ChatOpenAI`, …), so a single hook there covers all
// providers. `invoke` also backs `.batch()` (which calls `invoke` per item); `_streamIterator`
// backs `.stream()`. The vendored OTel instrumentation instead patched each provider package to
// dodge `@langchain/core` being bundled, but orchestrion transforms its source directly regardless
// of bundling.
const chatModelConfig = ['dist/language_models/chat_models.cjs', 'dist/language_models/chat_models.js'].flatMap(
  filePath => {
    const module = { name: '@langchain/core', versionRange: '>=0.1.0 <2.0.0', filePath };

    return [
      {
        channelName: 'chatModelInvoke',
        module,
        functionQuery: { className: 'BaseChatModel', methodName: 'invoke', kind: 'Async' as const },
      },
      {
        channelName: 'chatModelStream',
        module,
        functionQuery: { className: 'BaseChatModel', methodName: '_streamIterator', kind: 'Async' as const },
      },
    ];
  },
);

// Embeddings have no shared concrete method on the base class (each provider implements
// `embedQuery`/`embedDocuments`), so they're hooked per package. These are the provider packages the
// vendored OTel instrumentation covered that actually ship an `Embeddings` subclass: `@langchain/openai`,
// `@langchain/google-genai` and `@langchain/mistralai` define the two methods on their own class, while
// `@langchain/google-vertexai` inherits them from the shared `@langchain/google-common` base, so that base
// is the module hooked for it. (anthropic and groq are chat-only — they ship no embeddings class.) The
// `embedQuery`/`embedDocuments` channel names are per-method; orchestrion prefixes them with the module
// name, so the full channel strings stay distinct across packages.
const EMBEDDINGS_PROVIDERS = [
  { name: '@langchain/openai', versionRange: '>=0.1.0 <2.0.0' },
  { name: '@langchain/google-genai', versionRange: '>=0.1.0 <3.0.0' },
  { name: '@langchain/mistralai', versionRange: '>=0.1.0 <2.0.0' },
  { name: '@langchain/google-common', versionRange: '>=0.1.0 <3.0.0' },
];

const EMBEDDINGS_METHODS = ['embedQuery', 'embedDocuments'] as const;

const embeddingsConfig = EMBEDDINGS_PROVIDERS.flatMap(({ name, versionRange }) =>
  ['dist/embeddings.cjs', 'dist/embeddings.js'].flatMap(filePath =>
    EMBEDDINGS_METHODS.map(method => ({
      channelName: method,
      module: { name, versionRange, filePath },
      functionQuery: { methodName: method, kind: 'Async' as const },
    })),
  ),
);

export const langchainConfig = [...chatModelConfig, ...embeddingsConfig] satisfies InstrumentationConfig[];

// The embeddings channel strings the subscriber binds to, derived from the provider list above so that
// adding a provider is a single edit that both instruments it and subscribes the listener to it.
export const langchainEmbeddingsChannels = EMBEDDINGS_PROVIDERS.flatMap(({ name }) =>
  EMBEDDINGS_METHODS.map(method => `orchestrion:${name}:${method}`),
);

export const langchainChannels = {
  LANGCHAIN_CHAT_MODEL_INVOKE: 'orchestrion:@langchain/core:chatModelInvoke',
  LANGCHAIN_CHAT_MODEL_STREAM: 'orchestrion:@langchain/core:chatModelStream',
} as const;
