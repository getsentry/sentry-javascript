import { describe, expect, it } from 'vitest';
import { instrumentGoogleGenAIClient } from '../../../src/ai/google-genai';
import { instrumentOpenAiClient } from '../../../src/ai/openai';

interface MutableClient {
  service: { execute: () => Promise<void> } | null;
  getVersion: (() => string) | null;
}

const clientInstrumenters: Array<{
  provider: string;
  instrument: (client: MutableClient) => MutableClient;
}> = [
  { provider: 'OpenAI', instrument: client => instrumentOpenAiClient(client) },
  { provider: 'Google GenAI', instrument: client => instrumentGoogleGenAIClient(client) },
];

describe('AI integration deep proxies', () => {
  it('returns stable references for OpenAI client properties', () => {
    const client = {
      chat: { completions: { create: () => Promise.resolve({}) } },
      getBaseURL: () => 'https://api.openai.com',
    };

    const instrumentedClient = instrumentOpenAiClient(client);
    const chat = instrumentedClient.chat;
    const completions = chat.completions;
    const create = completions.create;
    const getBaseURL = instrumentedClient.getBaseURL;

    expect(instrumentedClient.chat).toBe(chat);
    expect(chat.completions).toBe(completions);
    expect(completions.create).toBe(create);
    expect(instrumentedClient.chat.completions.create).toBe(create);
    expect(instrumentedClient.getBaseURL).toBe(getBaseURL);
  });

  it('returns stable references for Google GenAI client properties', () => {
    const client = {
      models: { generateContent: () => Promise.resolve({}) },
      chats: { create: () => ({ sendMessage: () => Promise.resolve({}) }) },
      getVersion: () => '1.0.0',
    };

    const instrumentedClient = instrumentGoogleGenAIClient(client);
    const models = instrumentedClient.models;
    const generateContent = models.generateContent;
    const chats = instrumentedClient.chats;
    const create = chats.create;
    const chat = chats.create();
    const sendMessage = chat.sendMessage;
    const getVersion = instrumentedClient.getVersion;

    expect(instrumentedClient.models).toBe(models);
    expect(models.generateContent).toBe(generateContent);
    expect(instrumentedClient.models.generateContent).toBe(generateContent);
    expect(instrumentedClient.chats).toBe(chats);
    expect(chats.create).toBe(create);
    expect(instrumentedClient.chats.create).toBe(create);
    expect(chat.sendMessage).toBe(sendMessage);
    expect(instrumentedClient.getVersion).toBe(getVersion);
  });

  it.each(clientInstrumenters)('drops cached $provider wrappers after properties are cleared', ({ instrument }) => {
    const service = { execute: () => Promise.resolve() };
    const getVersion = () => '1.0.0';
    const client: MutableClient = { service, getVersion };
    const instrumentedClient = instrument(client);
    const cachedService = instrumentedClient.service;
    const cachedGetVersion = instrumentedClient.getVersion;

    client.service = null;
    client.getVersion = null;
    expect(instrumentedClient.service).toBeNull();
    expect(instrumentedClient.getVersion).toBeNull();

    client.service = service;
    client.getVersion = getVersion;
    expect(instrumentedClient.service).not.toBe(cachedService);
    expect(instrumentedClient.getVersion).not.toBe(cachedGetVersion);
  });
});
