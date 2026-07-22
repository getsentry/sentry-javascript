import { describe, expect, it } from 'vitest';
import { instrumentGoogleGenAIClient } from '../../src/tracing/google-genai';
import { instrumentOpenAiClient } from '../../src/tracing/openai';

describe('AI integration deep proxies', () => {
  it('returns stable references for OpenAI client properties', () => {
    const client = {
      chat: { completions: { create: () => Promise.resolve({}) } },
      getBaseURL: () => 'https://api.openai.com',
    };

    const instrumentedClient = instrumentOpenAiClient(client);
    const completions = instrumentedClient.chat.completions;
    const create = completions.create;
    const getBaseURL = instrumentedClient.getBaseURL;

    expect(instrumentedClient.chat.completions).toBe(completions);
    expect(instrumentedClient.chat.completions.create).toBe(create);
    expect(instrumentedClient.getBaseURL).toBe(getBaseURL);
  });

  it('returns stable references for Google GenAI client properties', () => {
    const client = {
      chats: { create: () => ({ sendMessage: () => Promise.resolve({}) }) },
      getVersion: () => '1.0.0',
    };

    const instrumentedClient = instrumentGoogleGenAIClient(client);
    const chats = instrumentedClient.chats;
    const create = chats.create;
    const getVersion = instrumentedClient.getVersion;

    expect(instrumentedClient.chats).toBe(chats);
    expect(instrumentedClient.chats.create).toBe(create);
    expect(instrumentedClient.getVersion).toBe(getVersion);
  });
});
