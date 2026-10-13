import type { Scope } from '@sentry/core';

export interface CurrentScopes {
  scope: Scope;
  isolationScope: Scope;
}
