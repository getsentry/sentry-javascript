import { generatePropagationContext } from '../../src/utils-hoist/propagationContext';

describe('generatePropagationContext', () => {
  it('generates a new minimal propagation context', () => {
    // eslint-disable-next-line deprecation/deprecation
    expect(generatePropagationContext()).toEqual({
      traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
  });
});
