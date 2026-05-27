import { describe, expect, it } from 'vitest';

import * as ServerUtils from '../src/index';

describe('@sentry-internal/server-utils', () => {
  it('loads the package entry point', () => {
    expect(ServerUtils).toBeDefined();
  });
});
