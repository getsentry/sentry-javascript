import { LocalVariablesSync, localVariablesSyncIntegration } from './local-variables-sync';

/**
 * Adds local variables to exception frames.
 *
 * @deprecated Use `localVariablesIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const LocalVariables = LocalVariablesSync;
// eslint-disable-next-line deprecation/deprecation
export type LocalVariables = LocalVariablesSync;

export const localVariablesIntegration = localVariablesSyncIntegration;
