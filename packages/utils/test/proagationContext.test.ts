import { describe, expect, it } from 'vitest';

import { generatePropagationContext } from '../src/propagationContext';

describe('generatePropagationContext', () => {
  it('generates a new minimal propagation context', () => {
    expect(generatePropagationContext()).toEqual({
      traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
  });
});
