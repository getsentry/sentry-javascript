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
  return methodPath.includes('Stream');
}

// Copied from https://googleapis.github.io/js-genai/release_docs/index.html
export type ContentListUnion = Content | Content[] | PartListUnion;
export type ContentUnion = Content | PartUnion[] | PartUnion;
export type Content = {
  parts?: Part[];
  role?: string;
};
export type PartUnion = Part | string;
export type Part = Record<string, unknown> & {
  inlineData?: {
    data?: string;
    displayName?: string;
    mimeType?: string;
  };
  text?: string;
};
export type PartListUnion = PartUnion[] | PartUnion;

// our consistent span message shape
export type Message = Record<string, unknown> & {
  role: string;
  content?: PartListUnion;
  parts?: PartListUnion;
};

/**
 *
 */
export function contentUnionToMessages(content: ContentListUnion, role = 'user'): Message[] {
  if (typeof content === 'string') {
    return [{ role, content }];
  }
  if (Array.isArray(content)) {
    return content.flatMap(content => contentUnionToMessages(content, role));
  }
  if (typeof content !== 'object' || !content) return [];
  if ('role' in content && typeof content.role === 'string') {
    return [content as Message];
  }
  if ('parts' in content) {
    return [{ ...content, role } as Message];
  }
  return [{ role, content }];
}
