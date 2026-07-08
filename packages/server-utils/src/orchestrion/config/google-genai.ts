import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

// `@google/genai` ships one bundled file per module format and the matcher compares `filePath` exactly,
// so we list every file the `node` export condition resolves to across the supported range: `index.js`
// (ESM+CJS for <0.15.0, CJS for <1.1.0), `index.mjs` (ESM for >=0.15.0), and `index.cjs` (CJS for >=1.1.0).
// A file that doesn't exist in a given version simply never matches, so listing all three is safe.
const NODE_DIST_FILES = ['dist/node/index.js', 'dist/node/index.mjs', 'dist/node/index.cjs'];

export const googleGenAiConfig = [
  // `generateContent`/`generateContentStream` are arrow properties assigned in the constructor, not class
  // methods, so they need `expressionName` rather than `className`/`methodName`.
  ...NODE_DIST_FILES.flatMap(filePath =>
    (['generateContent', 'generateContentStream'] as const).map(expressionName => ({
      channelName: 'generate-content',
      module: { name: '@google/genai', versionRange: '>=0.10.0 <2', filePath },
      functionQuery: { expressionName, kind: 'Auto' as const },
    })),
  ),
  // `embedContent` and the `Chat` methods are real class methods.
  ...NODE_DIST_FILES.map(filePath => ({
    channelName: 'embed-content',
    module: { name: '@google/genai', versionRange: '>=0.10.0 <2', filePath },
    functionQuery: { className: 'Models', methodName: 'embedContent', kind: 'Auto' as const },
  })),
  // `sendMessage`/`sendMessageStream` internally delegate to `Models.generateContent(Stream)`; the
  // subscriber suppresses that nested `generate-content` event so a chat call yields a single span.
  ...NODE_DIST_FILES.flatMap(filePath =>
    (['sendMessage', 'sendMessageStream'] as const).map(methodName => ({
      channelName: 'chat',
      module: { name: '@google/genai', versionRange: '>=0.10.0 <2', filePath },
      functionQuery: { className: 'Chat', methodName, kind: 'Auto' as const },
    })),
  ),
] satisfies InstrumentationConfig[];

export const googleGenAiChannels = {
  GOOGLE_GENAI_GENERATE_CONTENT: 'orchestrion:@google/genai:generate-content',
  GOOGLE_GENAI_EMBED_CONTENT: 'orchestrion:@google/genai:embed-content',
  GOOGLE_GENAI_CHAT: 'orchestrion:@google/genai:chat',
} as const;
