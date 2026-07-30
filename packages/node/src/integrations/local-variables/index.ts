import type { Integration } from '@sentry/core';
import type { LocalVariablesIntegrationOptions } from './common';
import { localVariablesAsyncIntegration } from './local-variables-async';

export const localVariablesIntegration = (options: LocalVariablesIntegrationOptions = {}): Integration => {
  return localVariablesAsyncIntegration(options);
};
