import type { InstrumentationConfig, InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { getCurrentScope, SDK_VERSION } from '@sentry/core';
import { INTEGRATION_NAME } from './constants';
import type { TelemetrySettings, VercelAiIntegration } from './types';

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

interface RecordingOptions {
  recordInputs?: boolean;
  recordOutputs?: boolean;
}

/**
 * Determines whether to record inputs and outputs for Vercel AI telemetry based on the configuration hierarchy.
 *
 * The order of precedence is:
 * 1. The vercel ai integration options
 * 2. The experimental_telemetry options in the vercel ai method calls
 * 3. When telemetry is explicitly enabled (isEnabled: true), default to recording
 * 4. Otherwise, use the sendDefaultPii option from client options
 */
export function determineRecordingSettings(
  integrationRecordingOptions: RecordingOptions | undefined,
  methodTelemetryOptions: RecordingOptions,
  telemetryExplicitlyEnabled: boolean | undefined,
  defaultRecordingEnabled: boolean,
): { recordInputs: boolean; recordOutputs: boolean } {
  const recordInputs =
    integrationRecordingOptions?.recordInputs !== undefined
      ? integrationRecordingOptions.recordInputs
      : methodTelemetryOptions.recordInputs !== undefined
        ? methodTelemetryOptions.recordInputs
        : telemetryExplicitlyEnabled === true
          ? true // When telemetry is explicitly enabled, default to recording inputs
          : defaultRecordingEnabled;

  const recordOutputs =
    integrationRecordingOptions?.recordOutputs !== undefined
      ? integrationRecordingOptions.recordOutputs
      : methodTelemetryOptions.recordOutputs !== undefined
        ? methodTelemetryOptions.recordOutputs
        : telemetryExplicitlyEnabled === true
          ? true // When telemetry is explicitly enabled, default to recording inputs
          : defaultRecordingEnabled;

  return { recordInputs, recordOutputs };
}

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
      return function (this: unknown, ...args: MethodArgs) {
        const existingExperimentalTelemetry = args[0].experimental_telemetry || {};
        const isEnabled = existingExperimentalTelemetry.isEnabled;

        const client = getCurrentScope().getClient();
        const integration = client?.getIntegrationByName<VercelAiIntegration>(INTEGRATION_NAME);
        const integrationOptions = integration?.options;
        const shouldRecordInputsAndOutputs = integration ? Boolean(client?.getOptions().sendDefaultPii) : false;

        const { recordInputs, recordOutputs } = determineRecordingSettings(
          integrationOptions,
          existingExperimentalTelemetry,
          isEnabled,
          shouldRecordInputsAndOutputs,
        );

        args[0].experimental_telemetry = {
          ...existingExperimentalTelemetry,
          isEnabled: isEnabled !== undefined ? isEnabled : true,
          recordInputs,
          recordOutputs,
        };

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
