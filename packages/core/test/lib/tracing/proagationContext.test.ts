import { generatePropagationContext } from '../../../src/tracing/propagationContext';

describe('generatePropagationContext', () => {
  it('generates a new minimal propagation context', () => {
    expect(generatePropagationContext()).toEqual({
      traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
  });
});
