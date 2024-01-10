import { LocalVariablesSync, localVariablesSyncIntegration } from './local-variables-sync';

/**
 * Adds local variables to exception frames
 */
export const LocalVariables = LocalVariablesSync;

export const localVariablesIntegration = localVariablesSyncIntegration;
