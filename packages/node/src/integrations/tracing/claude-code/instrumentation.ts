import type { InstrumentationConfig, InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { getClient, SDK_VERSION } from '@sentry/core';
import { patchClaudeCodeQuery } from './helpers';
import type { ClaudeCodeOptions } from './types';

const SUPPORTED_VERSIONS = ['>=0.1.0 <1.0.0'];

type ClaudeCodeInstrumentationConfig = InstrumentationConfig & ClaudeCodeOptions;

interface ClaudeAgentSdkModuleExports {
  [key: string]: unknown;
  query: (...args: unknown[]) => AsyncGenerator<unknown, void, unknown>;
}

/** OpenTelemetry instrumentation for the Claude Code Agent SDK. */
export class SentryClaudeCodeAgentSdkInstrumentation extends InstrumentationBase<ClaudeCodeInstrumentationConfig> {
  public constructor(config: ClaudeCodeInstrumentationConfig = {}) {
    super('@sentry/instrumentation-claude-code-agent-sdk', SDK_VERSION, config);
  }

  /** @inheritdoc */
  public init(): InstrumentationModuleDefinition {
    return new InstrumentationNodeModuleDefinition(
      '@anthropic-ai/claude-agent-sdk',
      SUPPORTED_VERSIONS,
      this._patch.bind(this),
    );
  }

  private _patch(moduleExports: ClaudeAgentSdkModuleExports): ClaudeAgentSdkModuleExports {
    const config = this.getConfig();
    const originalQuery = moduleExports.query;

    if (typeof originalQuery !== 'function') {
      this._diag.warn('Could not find query function in @anthropic-ai/claude-agent-sdk');
      return moduleExports;
    }

    const wrappedQuery = function (this: unknown, ...args: unknown[]): AsyncGenerator<unknown, void, unknown> {
      const client = getClient();
      const defaultPii = Boolean(client?.getOptions().sendDefaultPii);
      const options: ClaudeCodeOptions = {
        recordInputs: config.recordInputs ?? defaultPii,
        recordOutputs: config.recordOutputs ?? defaultPii,
        agentName: config.agentName ?? 'claude-code',
      };
      return patchClaudeCodeQuery(originalQuery, options).apply(this, args);
    };

    Object.defineProperty(wrappedQuery, 'name', { value: originalQuery.name });
    Object.defineProperty(wrappedQuery, 'length', { value: originalQuery.length });

    // ESM vs CJS handling
    if (Object.prototype.toString.call(moduleExports) === '[object Module]') {
      try {
        moduleExports.query = wrappedQuery;
      } catch {
        Object.defineProperty(moduleExports, 'query', {
          value: wrappedQuery, writable: true, configurable: true, enumerable: true,
        });
      }
      if (moduleExports.default && typeof moduleExports.default === 'object' && 'query' in moduleExports.default) {
        try { (moduleExports.default as Record<string, unknown>).query = wrappedQuery; } catch { /* ignore */ }
      }
      return moduleExports;
    }
    return { ...moduleExports, query: wrappedQuery };
  }
}
