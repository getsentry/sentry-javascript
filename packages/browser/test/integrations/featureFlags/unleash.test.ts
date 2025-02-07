import { unleashIntegration } from '../../../src';

describe('Unleash', () => {
  it('Throws error if given empty options', () => {
    expect(() => unleashIntegration({})).toThrow('featureFlagClientClass option is required');
  });
});
