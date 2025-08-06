import { ANTHROPIC_AI_INSTRUMENTED_METHODS } from './constants';
import type { AnthropicAiInstrumentedMethod } from './types';

/**
 * Check if a method path should be instrumented
 */
export function shouldInstrument(methodPath: string): methodPath is AnthropicAiInstrumentedMethod {
  return ANTHROPIC_AI_INSTRUMENTED_METHODS.includes(methodPath as AnthropicAiInstrumentedMethod);
}
