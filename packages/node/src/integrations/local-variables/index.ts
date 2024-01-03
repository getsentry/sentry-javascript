import { convertIntegrationFnToClass } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { NODE_VERSION } from '../../nodeVersion';
import type { Options } from './common';
import { localVariablesAsync } from './local-variables-async';
import { localVariablesSync } from './local-variables-sync';

const INTEGRATION_NAME = 'LocalVariables';

/**
 * Adds local variables to exception frames
 */
const localVariables: IntegrationFn = (options: Options = {}) => {
  return NODE_VERSION.major < 19 ? localVariablesSync(options) : localVariablesAsync(options);
};

/**
 * Adds local variables to exception frames
 */
// eslint-disable-next-line deprecation/deprecation
export const LocalVariables = convertIntegrationFnToClass(INTEGRATION_NAME, localVariables);
