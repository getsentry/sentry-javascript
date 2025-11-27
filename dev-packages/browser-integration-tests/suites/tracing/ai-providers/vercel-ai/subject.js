import { addVercelAiProcessors, getClient } from '@sentry/browser';
import { mockGenerateText, mockModelBasic } from './mocks.js';

console.log('getting client');
const client = getClient();
console.log('adding processors');
addVercelAiProcessors(client);

console.log('running generateText with mock model');
const result = await mockGenerateText({
  model: mockModelBasic,
  prompt: 'Test prompt',
});

console.log('Generated text result:', result);
