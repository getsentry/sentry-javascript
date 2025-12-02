import {
  InstrumentationBase,
  type InstrumentationConfig,
  type InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import type { CompiledGraph, LangGraphOptions } from '@sentry/core';
import { getClient, instrumentStateGraphCompile, SDK_VERSION } from '@sentry/core';

const supportedVersions = ['>=0.0.0 <2.0.0'];

type LangGraphInstrumentationOptions = InstrumentationConfig & LangGraphOptions;

/**
 * Represents the patched shape of the LangGraph module export.
 */
interface PatchedModuleExports {
  [key: string]: unknown;
  StateGraph?: abstract new (...args: unknown[]) => unknown;
}

/**
 * Sentry LangGraph instrumentation using OpenTelemetry.
 */
export class SentryLangGraphInstrumentation extends InstrumentationBase<LangGraphInstrumentationOptions> {
  public constructor(config: LangGraphInstrumentationOptions = {}) {
    super('@sentry/instrumentation-langgraph', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      '@langchain/langgraph',
      supportedVersions,
      this._patch.bind(this),
      exports => exports,
      [
        new InstrumentationNodeModuleFile(
          /**
           * In CJS, LangGraph packages re-export from dist/index.cjs files.
           * Patching only the root module sometimes misses the real implementation or
           * gets overwritten when that file is loaded. We add a file-level patch so that
           * _patch runs again on the concrete implementation
           */
          '@langchain/langgraph/dist/index.cjs',
          supportedVersions,
          this._patch.bind(this),
          exports => exports,
        ),
      ],
    );
    return module;
  }

  /**
   * Core patch logic applying instrumentation to the LangGraph module.
   */
  private _patch(exports: PatchedModuleExports): PatchedModuleExports | void {
    const client = getClient();
    const defaultPii = Boolean(client?.getOptions().sendDefaultPii);

    const config = this.getConfig();
    const recordInputs = config.recordInputs ?? defaultPii;
    const recordOutputs = config.recordOutputs ?? defaultPii;

    const options: LangGraphOptions = {
      recordInputs,
      recordOutputs,
    };

    // Patch StateGraph.compile to instrument both compile() and invoke()
    if (exports.StateGraph && typeof exports.StateGraph === 'function') {
      const StateGraph = exports.StateGraph as {
        prototype: Record<string, unknown>;
      };

      StateGraph.prototype.compile = instrumentStateGraphCompile(
        StateGraph.prototype.compile as (...args: unknown[]) => CompiledGraph,
        options,
      );
    }

    return exports;
  }
}
