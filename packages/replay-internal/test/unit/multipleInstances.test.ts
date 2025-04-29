import { describe, expect, it } from 'vitest';
import { replayIntegration } from '../../src/integration';

describe('Unit | multipleInstances', () => {
  it('throws on creating multiple instances', function () {
    expect(() => {
      replayIntegration();
      replayIntegration();
    }).toThrow();
  });
});
