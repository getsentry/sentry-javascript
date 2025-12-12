export interface ClaudeCodeOptions {
  /**
   * Whether to record prompt messages.
   * Defaults to Sentry client's `sendDefaultPii` setting.
   */
  recordInputs?: boolean;

  /**
   * Whether to record response text, tool calls, and tool outputs.
   * Defaults to Sentry client's `sendDefaultPii` setting.
   */
  recordOutputs?: boolean;

  /**
   * Custom agent name to use for this integration.
   * This allows you to differentiate between multiple Claude Code agents in your application.
   * Defaults to 'claude-code'.
   *
   * @example
   * ```typescript
   * Sentry.init({
   *   integrations: [
   *     Sentry.claudeCodeAgentSdkIntegration({ agentName: 'app-builder' })
   *   ]
   * });
   * ```
   */
  agentName?: string;
}
