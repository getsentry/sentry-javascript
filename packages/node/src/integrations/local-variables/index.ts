import type { Integration } from '@sentry/core';
import { NODE_VERSION } from '../../nodeVersion';
import type { LocalVariablesIntegrationOptions } from './common';
import { localVariablesAsyncIntegration } from './local-variables-async';
import { localVariablesSyncIntegration } from './local-variables-sync';

export const localVariablesIntegration = (options: LocalVariablesIntegrationOptions = {}): Integration => {
  return NODE_VERSION.major < 19 ? localVariablesSyncIntegration(options) : localVariablesAsyncIntegration(options);
};
