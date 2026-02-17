import { createLangChainCallbackHandler } from '@sentry/browser';
import { MockChatAnthropic } from './mocks.js';

const callbackHandler = createLangChainCallbackHandler({
  recordInputs: false,
  recordOutputs: false,
});

const chatModel = new MockChatAnthropic({
  model: 'claude-3-haiku-20240307',
  temperature: 0.7,
  maxTokens: 100,
});

// Test that manual instrumentation doesn't crash the browser
// The instrumentation automatically creates spans
// We can provide callbacks in the config object:https://docs.langchain.com/oss/python/langchain/models#invocation-config
const response = await chatModel.invoke('What is the capital of France?', {
  callbacks: [callbackHandler],
});

console.log('Received response', response);
