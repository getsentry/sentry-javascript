import { GOOGLE_GENAI_INSTRUMENTED_METHODS } from './constants';
import type { GoogleGenAIIstrumentedMethod } from './types';

/**
 * Check if a method path should be instrumented
 */
export function shouldInstrument(methodPath: string): methodPath is GoogleGenAIIstrumentedMethod {
  // Check for exact matches first (like 'models.generateContent')
  if (GOOGLE_GENAI_INSTRUMENTED_METHODS.includes(methodPath as GoogleGenAIIstrumentedMethod)) {
    return true;
  }

  // Check for method name matches (like 'sendMessage' from chat instances)
  const methodName = methodPath.split('.').pop();
  return GOOGLE_GENAI_INSTRUMENTED_METHODS.includes(methodName as GoogleGenAIIstrumentedMethod);
}

/**
 * Check if a method is a streaming method
 */
export function isStreamingMethod(methodPath: string): boolean {
  return (
    methodPath.includes('Stream') ||
    methodPath.endsWith('generateContentStream') ||
    methodPath.endsWith('sendMessageStream')
  );
}
