import { describe, expect, it } from 'vitest';
import * as index from '../src/index.client';

describe('effect index export', () => {
  it('has correct exports', () => {
    expect(index.captureException).toBeDefined();
  });
});
