import { makeMultiplexedTransport, moduleMetadataIntegration } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import * as Bundle from '../src/index.bundle';
import * as MfeBundle from '../src/index.bundle.mfe';

describe('index.bundle.mfe', () => {
  it('exports the errors-only bundle plus makeMultiplexedTransport and moduleMetadataIntegration', () => {
    expect({ ...MfeBundle }).toEqual({ ...Bundle, makeMultiplexedTransport, moduleMetadataIntegration });
  });
});
