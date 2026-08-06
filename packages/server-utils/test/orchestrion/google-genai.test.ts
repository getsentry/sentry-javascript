import { create } from '@apm-js-collab/code-transformer';
import { describe, expect, it } from 'vitest';
import { googleGenAiConfig } from '../../src/orchestrion/config/google-genai';

// The file every `@google/genai` `node` export condition resolves to for the ESM build; it's one of
// the paths listed in `googleGenAiConfig`, so the real transformer will pick up its configs for it.
const FILE_PATH = 'dist/node/index.mjs';

// Minimal fixtures reproducing the exact `Models`/`Chat` member shapes the SDK ships. `embedContent`
// is the one that shifted between majors: a real class method in v1, a constructor-assigned arrow in
// v2. `generateContent(Stream)` are arrows and `sendMessage(Stream)` are class methods in both.
const V1_SOURCE = `
class Models {
  constructor() {
    this.generateContent = async (params) => params;
    this.generateContentStream = async (params) => params;
  }
  async embedContent(params) { return params; }
}
class Chat {
  async sendMessage(params) { return params; }
  async sendMessageStream(params) { return params; }
}
export { Models, Chat };
`;

const V2_SOURCE = `
class Models {
  constructor() {
    this.generateContent = async (params) => params;
    this.generateContentStream = async (params) => params;
    this.embedContent = async (params) => params;
  }
}
class Chat {
  async sendMessage(params) { return params; }
  async sendMessageStream(params) { return params; }
}
export { Models, Chat };
`;

function injectedChannels(version: string, source: string): string[] {
  const matcher = create(googleGenAiConfig);
  const transformer = matcher.getTransformer('@google/genai', version, FILE_PATH);
  if (!transformer) {
    return [];
  }
  const { code } = transformer.transform(source, 'esm');
  return [...new Set(code.match(/orchestrion:@google\/genai:[a-z-]+/g) ?? [])].sort();
}

describe('googleGenAiConfig', () => {
  const ALL_CHANNELS = [
    'orchestrion:@google/genai:chat',
    'orchestrion:@google/genai:embed-content',
    'orchestrion:@google/genai:generate-content',
  ];

  it('instruments every channel in the v1 source shape', () => {
    expect(injectedChannels('1.20.0', V1_SOURCE)).toEqual(ALL_CHANNELS);
  });

  it.each(['2.0.0', '2.16.0'])(
    'instruments every channel in the v2 source shape (v%s), including the arrow-property embedContent',
    version => {
      expect(injectedChannels(version, V2_SOURCE)).toEqual(ALL_CHANNELS);
    },
  );

  it('does not match a version outside the supported range', () => {
    const matcher = create(googleGenAiConfig);
    expect(matcher.getTransformer('@google/genai', '0.9.0', FILE_PATH)).toBeUndefined();
    expect(matcher.getTransformer('@google/genai', '3.0.0', FILE_PATH)).toBeUndefined();
  });
});
