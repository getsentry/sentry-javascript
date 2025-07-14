import type { Integration } from '@sentry/core';

/**
 * Attribute values may be any non-nullish primitive value except an object.
 *
 * null or undefined attribute values are invalid and will result in undefined behavior.
 */
export type AttributeValue =
  | string
  | number
  | boolean
  | Array<null | undefined | string>
  | Array<null | undefined | number>
  | Array<null | undefined | boolean>;

export interface OpenAiOptions {
  /**
   * Enable or disable input recording. Enabled if `sendDefaultPii` is `true`
   */
  recordInputs?: boolean;
  /**
   * Enable or disable output recording. Enabled if `sendDefaultPii` is `true`
   */
  recordOutputs?: boolean;
}

export interface OpenAiIntegration extends Integration {
  options: OpenAiOptions;
}

/**
 * OpenAI Client interface for type safety
 */
export interface OpenAiClient {
  responses?: {
    create: (...args: any[]) => Promise<any>;
  };
  chat?: {
    completions?: {
      create: (...args: any[]) => Promise<any>;
    };
  };
}