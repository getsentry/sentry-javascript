import { generatePropagationContext } from '../../../src/utils/propagationContext';

describe('generatePropagationContext', () => {
  it('generates a new minimal propagationContext', () => {
    const context = generatePropagationContext();
    expect(context).toStrictEqual({
      traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
  });
});
