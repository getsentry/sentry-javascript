import {
  _INTERNAL_addFeatureFlagToActiveSpan,
  _INTERNAL_insertFlagToScope,
} from '@sentry/core';

const EVALUATION_METHODS = new Set([
  'get',
  'getBooleanValue',
  'getStringValue',
  'getNumberValue',
  'getObjectValue',
  'getBooleanDetails',
  'getStringDetails',
  'getNumberDetails',
  'getObjectDetails',
]);

type FlagshipEvaluationDetails = {
  flagKey: string;
  value: unknown;
};

function isEvaluationDetails(value: unknown): value is FlagshipEvaluationDetails {
  return (
    value != null &&
    typeof value === 'object' &&
    'flagKey' in value &&
    typeof (value as FlagshipEvaluationDetails).flagKey === 'string' &&
    'value' in value
  );
}

function recordFlagEvaluation(flagKey: string, value: unknown): void {
  _INTERNAL_insertFlagToScope(flagKey, value);
  _INTERNAL_addFeatureFlagToActiveSpan(flagKey, value);
}
export function instrumentFlagship<T extends object>(flagship: T): T {
  return new Proxy(flagship, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (typeof prop !== 'string' || !EVALUATION_METHODS.has(prop) || typeof value !== 'function') {
        return value;
      }

      const original = value as (...args: unknown[]) => unknown;

      return async (...args: unknown[]) => {
        const result = await Reflect.apply(original, target, args);

        if (prop.endsWith('Details') && isEvaluationDetails(result)) {
          recordFlagEvaluation(result.flagKey, result.value);
          return result;
        }

        const flagKey = args[0];
        if (typeof flagKey === 'string') {
          recordFlagEvaluation(flagKey, result);
        }

        return result;
      };
    },
  });
}
