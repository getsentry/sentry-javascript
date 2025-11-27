import type { InstrumentationConfig, InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { getClient, SDK_VERSION } from '@sentry/core';
import { patchClaudeCodeQuery } from './instrumentation';
import type { ClaudeCodeOptions } from './types';

const SUPPORTED_VERSIONS = ['>=0.1.0 <1.0.0'];

type ClaudeCodeInstrumentationConfig = InstrumentationConfig & ClaudeCodeOptions;

/**
 * Represents the shape of the @anthropic-ai/claude-agent-sdk module exports.
 */
interface ClaudeAgentSdkModuleExports {
  [key: string]: unknown;
  query: (...args: unknown[]) => AsyncGenerator<unknown, void, unknown>;
}

/**
 * OpenTelemetry instrumentation for the Claude Code Agent SDK.
 *
 * This instrumentation automatically patches the `query` function from
 * `@anthropic-ai/claude-agent-sdk` to add Sentry tracing spans.
 *
 * It handles both ESM and CommonJS module formats.
 */
export class SentryClaudeCodeAgentSdkInstrumentation extends InstrumentationBase<ClaudeCodeInstrumentationConfig> {
  public constructor(config: ClaudeCodeInstrumentationConfig = {}) {
    super('@sentry/instrumentation-claude-code-agent-sdk', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the module to be patched.
   */
  public init(): InstrumentationModuleDefinition {
    return new InstrumentationNodeModuleDefinition(
      '@anthropic-ai/claude-agent-sdk',
      SUPPORTED_VERSIONS,
      this._patch.bind(this),
    );
  }

  /**
   * Patches the module exports to wrap the query function with instrumentation.
   */
  private _patch(moduleExports: ClaudeAgentSdkModuleExports): ClaudeAgentSdkModuleExports {
    const config = this.getConfig();
    const originalQuery = moduleExports.query;

    if (typeof originalQuery !== 'function') {
      this._diag.warn('Could not find query function in @anthropic-ai/claude-agent-sdk');
      return moduleExports;
    }

    // Create wrapped query function
    const wrappedQuery = function (
      this: unknown,
      ...args: unknown[]
    ): AsyncGenerator<unknown, void, unknown> {
      const client = getClient();
      const defaultPii = Boolean(client?.getOptions().sendDefaultPii);

      const options: ClaudeCodeOptions = {
        recordInputs: config.recordInputs ?? defaultPii,
        recordOutputs: config.recordOutputs ?? defaultPii,
        agentName: config.agentName ?? 'claude-code',
      };

      // Use the existing patch logic
      const instrumentedQuery = patchClaudeCodeQuery(originalQuery, options);
      return instrumentedQuery.apply(this, args);
    };

    // Preserve function properties
    Object.defineProperty(wrappedQuery, 'name', { value: originalQuery.name });
    Object.defineProperty(wrappedQuery, 'length', { value: originalQuery.length });

    // Check if ESM module namespace object
    // https://tc39.es/ecma262/#sec-module-namespace-objects
    if (Object.prototype.toString.call(moduleExports) === '[object Module]') {
      // ESM: Replace query export directly
      // OTel's instrumentation makes these writable
      try {
        moduleExports.query = wrappedQuery;
      } catch {
        // If direct assignment fails, try defineProperty
        Object.defineProperty(moduleExports, 'query', {
          value: wrappedQuery,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }

      // Also patch default export if it has a query property
      if (
        moduleExports.default &&
        typeof moduleExports.default === 'object' &&
        'query' in moduleExports.default
      ) {
        try {
          (moduleExports.default as Record<string, unknown>).query = wrappedQuery;
        } catch {
          // Ignore if we can't patch default - this is expected in some cases
        }
      }

      return moduleExports;
    } else {
      // CJS: Return new object with patched query spread over original
      return {
        ...moduleExports,
        query: wrappedQuery,
      };
    }
  }
}
