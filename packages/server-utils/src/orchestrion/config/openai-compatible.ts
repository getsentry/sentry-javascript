import type { InstrumentationConfig } from '../apmTypes';

/**
 * Many providers (Groq, Together, ...) ship a Stainless-generated SDK that mirrors the classic `openai`
 * file layout: `resources/chat/completions.{js,mjs}` (class `Completions`) and
 * `resources/embeddings.{js,mjs}` (class `Embeddings`), each with a `create(body, options)` that returns
 * a thenable `APIPromise`. Sync tracing preserves its lazy body parsing; Auto would trigger it via `.then()`.
 * A streaming call resolves to the same OpenAI-style async-iterable `Stream` the openai integration consumes. These
 * SDKs ship dual CJS/ESM and the matcher compares `filePath` exactly, hence one entry per built file.
 *
 * Because the wire format is OpenAI-compatible, the span building, streaming and response parsing are all
 * reused from `ai/openai`; only the module name, channels and `gen_ai.provider.name` differ per provider.
 */
export function openAiCompatibleConfig(module: { name: string; versionRange: string }): InstrumentationConfig[] {
  return [
    ...['resources/chat/completions.js', 'resources/chat/completions.mjs'].map(filePath => ({
      channelName: 'chat',
      module: { ...module, filePath },
      functionQuery: { className: 'Completions', methodName: 'create', kind: 'Sync' as const },
    })),
    ...['resources/embeddings.js', 'resources/embeddings.mjs'].map(filePath => ({
      channelName: 'embeddings',
      module: { ...module, filePath },
      functionQuery: { className: 'Embeddings', methodName: 'create', kind: 'Sync' as const },
    })),
  ];
}
