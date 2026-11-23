import { describe, expect, it } from 'vitest';
import { piniaIntegration } from '../../src/client/piniaIntegration';

describe('piniaIntegration', () => {
  it('records the options it was created with, not the Pinia instance', () => {
    const pinia = { use: () => {}, state: { value: { user: { email: 'jane@example.com' } } } };

    expect(piniaIntegration(pinia, { attachState: false })._options).toEqual({ attachState: false });
  });
});
