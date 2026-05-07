import {
  InstrumentationBase,
  type InstrumentationConfig,
  type InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import type { CompiledGraph, LangGraphOptions } from '@sentry/core';
import { getClient, instrumentCreateReactAgent, instrumentLangGraph, SDK_VERSION } from '@sentry/core';

const supportedVersions = ['>=0.0.0 <2.0.0'];

type LangGraphInstrumentationOptions = InstrumentationConfig & LangGraphOptions;

/**
 * Represents the patched shape of the LangGraph module export.
 */
interface PatchedModuleExports {
  [key: string]: unknown;
  StateGraph?: abstract new (...args: unknown[]) => unknown;
  createReactAgent?: (...args: unknown[]) => CompiledGraph;
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
  public init(): InstrumentationModuleDefinition[] {
    return [
      new InstrumentationNodeModuleDefinition(
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
          new InstrumentationNodeModuleFile(
            /**
             * In CJS, the prebuilt submodule re-exports from dist/prebuilt/index.cjs.
             * We add a file-level patch under the main module so that CJS require()
             * of @langchain/langgraph/prebuilt gets patched.
             */
            '@langchain/langgraph/dist/prebuilt/index.cjs',
            supportedVersions,
            this._patch.bind(this),
            exports => exports,
          ),
        ],
      ),
      new InstrumentationNodeModuleDefinition(
        '@langchain/langgraph/prebuilt',
        supportedVersions,
        this._patch.bind(this),
        exports => exports,
        [
          new InstrumentationNodeModuleFile(
            /**
             * In CJS, the prebuilt submodule re-exports from dist/prebuilt/index.cjs.
             * We add file-level patches so _patch runs on the concrete implementation.
             */
            '@langchain/langgraph/dist/prebuilt/index.cjs',
            supportedVersions,
            this._patch.bind(this),
            exports => exports,
          ),
        ],
      ),
    ];
  }

  /**
   * Core patch logic applying instrumentation to the LangGraph module.
   */
  private _patch(exports: PatchedModuleExports): PatchedModuleExports | void {
    const client = getClient();
    const options = {
      ...this.getConfig(),
      recordInputs: this.getConfig().recordInputs ?? client?.getOptions().sendDefaultPii,
      recordOutputs: this.getConfig().recordOutputs ?? client?.getOptions().sendDefaultPii,
    };

    // Patch StateGraph.compile to instrument both compile() and invoke()
    if (exports.StateGraph && typeof exports.StateGraph === 'function') {
      instrumentLangGraph(exports.StateGraph.prototype as { compile: (...args: unknown[]) => unknown }, options);
    }

    // Patch createReactAgent to instrument agent creation and invocation
    if (exports.createReactAgent && typeof exports.createReactAgent === 'function') {
      const originalCreateReactAgent = exports.createReactAgent;
      Object.defineProperty(exports, 'createReactAgent', {
        value: instrumentCreateReactAgent(originalCreateReactAgent as (...args: unknown[]) => CompiledGraph, options),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    return exports;
  }
}
