import {
  InstrumentationBase,
  type InstrumentationConfig,
  type InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import type { CompiledGraph, LangGraphOptions } from '@sentry/core';
import { getClient, instrumentStateGraphCompile, instrumentCreateReactAgent, SDK_VERSION } from '@sentry/core';

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
  public init(): InstrumentationModuleDefinition[] {
    const mainModule = new InstrumentationNodeModuleDefinition(
      '@langchain/langgraph',
      supportedVersions,
      this._patchMainModule.bind(this),
      exports => exports,
      [
        new InstrumentationNodeModuleFile(
          /**
           * In CJS, LangGraph packages re-export from dist/index.cjs files.
           * Patching only the root module sometimes misses the real implementation or
           * gets overwritten when that file is loaded. We add a file-level patch so that
           * _patchMainModule runs again on the concrete implementation
          */
          '@langchain/langgraph/dist/index.cjs',
          supportedVersions,
          this._patchMainModule.bind(this),
          exports => exports,
        ),
      ],
    );

    const prebuiltModule = new InstrumentationNodeModuleDefinition(
      '@langchain/langgraph/prebuilt',
      supportedVersions,
      this._patchPrebuiltModule.bind(this),
      exports => exports,
      [
        new InstrumentationNodeModuleFile(
          /**
           * In CJS, LangGraph packages re-export from dist/prebuilt/index.cjs files.
           * Patching only the root module sometimes misses the real implementation or
           * gets overwritten when that file is loaded. We add a file-level patch so that
           * _patchPrebuiltModule runs again on the concrete implementation
          */
          '@langchain/langgraph/dist/prebuilt/index.cjs',
          supportedVersions,
          this._patchPrebuiltModule.bind(this),
          exports => exports,
        ),
      ],
    );

    return [mainModule, prebuiltModule];
  }

  /**
   * Patch logic applying instrumentation to the LangGraph main module.
   */
  private _patchMainModule(exports: PatchedModuleExports): PatchedModuleExports | void {
    const options = this._getOptions();

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

  /**
   * Patch logic applying instrumentation to the LangGraph prebuilt module.
   */
  private _patchPrebuiltModule(exports: PatchedModuleExports): PatchedModuleExports | void {
    const options = this._getOptions();

    // Patch createReactAgent to instrument the agent creation and invocation
    if (exports.createReactAgent && typeof exports.createReactAgent === 'function') {
      exports.createReactAgent = instrumentCreateReactAgent(
        exports.createReactAgent as (...args: unknown[]) => CompiledGraph,
        options,
      );
    }

    return exports;
  }

  /**
   * Helper to get instrumentation options
   */
  private _getOptions(): LangGraphOptions {
    const client = getClient();
    const defaultPii = Boolean(client?.getOptions().sendDefaultPii);
    const config = this.getConfig();

    return {
      recordInputs: config.recordInputs ?? defaultPii,
      recordOutputs: config.recordOutputs ?? defaultPii,
    };
  }
}
