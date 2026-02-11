/**
 * Types for Cloudflare Agents integration
 */

/**
 * Options for instrumenting Cloudflare Agents
 */
export interface InstrumentCloudflareAgentsOptions {
  /**
   * Whether to record inputs (method arguments) to callable methods.
   * Uses the standard `gen_ai.input.messages` attribute.
   * Defaults to the value of `sendDefaultPii` from the client options.
   *
   * @default undefined (uses sendDefaultPii)
   */
  recordInputs?: boolean;

  /**
   * Whether to record outputs (method return values) from callable methods.
   * Uses the standard `gen_ai.output.messages` attribute.
   * Defaults to the value of `sendDefaultPii` from the client options.
   *
   * @default undefined (uses sendDefaultPii)
   */
  recordOutputs?: boolean;

  /**
   * Whether to record state changes from callable methods.
   * Records the agent's state before and after method execution.
   * Defaults to the value of `sendDefaultPii` from the client options.
   *
   * @default undefined (uses sendDefaultPii)
   */
  recordStateChanges?: boolean;
}

