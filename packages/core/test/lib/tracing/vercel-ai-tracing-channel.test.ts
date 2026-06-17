import { describe, expect, it } from 'vitest';
import { SentrySpan } from '../../../src/tracing/sentrySpan';
import { failVercelAiTracingChannelSpan } from '../../../src/tracing/vercel-ai/tracing-channel';
import { toolDescriptionMap } from '../../../src/tracing/vercel-ai/constants';

describe('vercel-ai tracing-channel spans', () => {
  it('cleans tool descriptions when a step span fails', () => {
    const span = new SentrySpan({ spanId: 'step-span-id' });
    toolDescriptionMap.set('step-span-id', new Map([['getWeather', 'Get the current weather']]));

    failVercelAiTracingChannelSpan(span, {
      type: 'step',
      event: {},
      error: new Error('Step failed'),
    });

    expect(toolDescriptionMap.has('step-span-id')).toBe(false);
  });
});
