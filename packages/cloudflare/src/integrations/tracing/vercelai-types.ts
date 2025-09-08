import type { Integration } from '@sentry/core';

/**
 * Options for the Vercel AI integration.
 */
export interface VercelAiOptions {
  /**
   * Enable or disable input recording. Enabled if `sendDefaultPii` is `true`
   * or if you set `isEnabled` to `true` in your ai SDK method telemetry settings
   */
  recordInputs?: boolean;
  /**
   * Enable or disable output recording. Enabled if `sendDefaultPii` is `true`
   * or if you set `isEnabled` to `true` in your ai SDK method telemetry settings
   */
  recordOutputs?: boolean;
}

export interface VercelAiIntegration extends Integration {
  options: VercelAiOptions;
}