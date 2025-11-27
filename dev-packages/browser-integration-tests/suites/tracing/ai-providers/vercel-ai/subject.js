import { addVercelAiProcessors, getClient } from '@sentry/browser';
import { mockGenerateText, mockModelBasic } from './mocks.js';

const client = getClient();
addVercelAiProcessors(client);

const result = await mockGenerateText({
  model: mockModelBasic,
  prompt: 'Test prompt',
});

console.log('Generated text result:', result);
