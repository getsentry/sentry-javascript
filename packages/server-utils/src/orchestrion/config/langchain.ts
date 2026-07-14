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
// `embedQuery`/`embedDocuments`), so they're hooked per provider. Only `@langchain/openai` is wired
// for now; other providers follow the same shape (a class extending `Embeddings` with async
// `embedQuery`/`embedDocuments`).
const embeddingsConfig = ['dist/embeddings.cjs', 'dist/embeddings.js'].flatMap(filePath => {
  const module = { name: '@langchain/openai', versionRange: '>=0.1.0 <2.0.0', filePath };

  return [
    { channelName: 'embedQuery', module, functionQuery: { methodName: 'embedQuery', kind: 'Async' as const } },
    { channelName: 'embedDocuments', module, functionQuery: { methodName: 'embedDocuments', kind: 'Async' as const } },
  ];
});

export const langchainConfig = [...chatModelConfig, ...embeddingsConfig] satisfies InstrumentationConfig[];

export const langchainChannels = {
  LANGCHAIN_CHAT_MODEL_INVOKE: 'orchestrion:@langchain/core:chatModelInvoke',
  LANGCHAIN_CHAT_MODEL_STREAM: 'orchestrion:@langchain/core:chatModelStream',
  LANGCHAIN_EMBED_QUERY: 'orchestrion:@langchain/openai:embedQuery',
  LANGCHAIN_EMBED_DOCUMENTS: 'orchestrion:@langchain/openai:embedDocuments',
} as const;
