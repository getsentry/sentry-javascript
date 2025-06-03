import type { InstrumentationConfig, InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { getCurrentScope, SDK_VERSION } from '@sentry/core';
import { INTEGRATION_NAME } from './constants';
import type { TelemetrySettings } from './types';

// List of patched methods
// From: https://sdk.vercel.ai/docs/ai-sdk-core/telemetry#collected-data
const INSTRUMENTED_METHODS = [
  'generateText',
  'streamText',
  'generateObject',
  'streamObject',
  'embed',
  'embedMany',
] as const;

interface MethodFirstArg extends Record<string, unknown> {
  experimental_telemetry?: TelemetrySettings;
}

type MethodArgs = [MethodFirstArg, ...unknown[]];

type PatchedModuleExports = Record<(typeof INSTRUMENTED_METHODS)[number], (...args: MethodArgs) => unknown> &
  Record<string, unknown>;

/**
 * This detects is added by the Sentry Vercel AI Integration to detect if the integration should
 * be enabled.
 *
 * It also patches the `ai` module to enable Vercel AI telemetry automatically for all methods.
 */
export class SentryVercelAiInstrumentation extends InstrumentationBase {
  private _isPatched = false;
  private _callbacks: (() => void)[] = [];

  public constructor(config: InstrumentationConfig = {}) {
    super('@sentry/instrumentation-vercel-ai', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition('ai', ['>=3.0.0 <5'], this._patch.bind(this));
    return module;
  }

  /**
   * Call the provided callback when the module is patched.
   * If it has already been patched, the callback will be called immediately.
   */
  public callWhenPatched(callback: () => void): void {
    if (this._isPatched) {
      callback();
    } else {
      this._callbacks.push(callback);
    }
  }

  /**
   * Patches module exports to enable Vercel AI telemetry.
   */
  private _patch(moduleExports: PatchedModuleExports): unknown {
    this._isPatched = true;

    this._callbacks.forEach(callback => callback());
    this._callbacks = [];

    function generatePatch(originalMethod: (...args: MethodArgs) => unknown) {
      return (...args: MethodArgs) => {
        const existingExperimentalTelemetry = args[0].experimental_telemetry || {};
        const isEnabled = existingExperimentalTelemetry.isEnabled;

        const client = getCurrentScope().getClient();
        const shouldRecordInputsAndOutputs = client?.getIntegrationByName(INTEGRATION_NAME)
          ? client.getOptions().sendDefaultPii
          : false;

        // Set recordInputs and recordOutputs based on sendDefaultPii if not explicitly set
        const recordInputs =
          existingExperimentalTelemetry.recordInputs !== undefined
            ? existingExperimentalTelemetry.recordInputs
            : shouldRecordInputsAndOutputs;
        const recordOutputs =
          existingExperimentalTelemetry.recordOutputs !== undefined
            ? existingExperimentalTelemetry.recordOutputs
            : shouldRecordInputsAndOutputs;

        args[0].experimental_telemetry = {
          ...existingExperimentalTelemetry,
          isEnabled: isEnabled !== undefined ? isEnabled : true,
          recordInputs,
          recordOutputs,
        };

        // @ts-expect-error we know that the method exists
        return originalMethod.apply(this, args);
      };
    }

    // Is this an ESM module?
    // https://tc39.es/ecma262/#sec-module-namespace-objects
    if (Object.prototype.toString.call(moduleExports) === '[object Module]') {
      // In ESM we take the usual route and just replace the exports we want to instrument
      for (const method of INSTRUMENTED_METHODS) {
        moduleExports[method] = generatePatch(moduleExports[method]);
      }

      return moduleExports;
    } else {
      // In CJS we can't replace the exports in the original module because they
      // don't have setters, so we create a new object with the same properties
      const patchedModuleExports = INSTRUMENTED_METHODS.reduce((acc, curr) => {
        acc[curr] = generatePatch(moduleExports[curr]);
        return acc;
      }, {} as PatchedModuleExports);

      return { ...moduleExports, ...patchedModuleExports };
    }
  }
}
