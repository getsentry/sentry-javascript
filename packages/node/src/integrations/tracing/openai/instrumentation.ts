import type { InstrumentationConfig, InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { getCurrentScope, SDK_VERSION } from '@sentry/core';
import { INTEGRATION_NAME } from './constants';
import { instrumentOpenAiClient } from './proxy';
import type { OpenAiIntegration, OpenAiOptions } from './types';

/**
 * OpenAI module exports interface
 */
interface PatchedModuleExports {
  OpenAI: new (...args: any[]) => any;
  [key: string]: unknown;
}

/**
 * Determines whether to record inputs and outputs for OpenAI telemetry based on the configuration hierarchy.
 *
 * The order of precedence is:
 * 1. The OpenAI integration options
 * 2. Otherwise, use the sendDefaultPii option from client options
 */
export function determineRecordingSettings(
  integrationRecordingOptions: OpenAiOptions | undefined,
  defaultRecordingEnabled: boolean,
): { recordInputs: boolean; recordOutputs: boolean } {
  const recordInputs =
    integrationRecordingOptions?.recordInputs !== undefined
      ? integrationRecordingOptions.recordInputs
      : defaultRecordingEnabled;

  const recordOutputs =
    integrationRecordingOptions?.recordOutputs !== undefined
      ? integrationRecordingOptions.recordOutputs
      : defaultRecordingEnabled;

  return { recordInputs, recordOutputs };
}

/**
 * This instrumentation detects OpenAI usage and automatically instruments OpenAI client instances.
 *
 * It patches the OpenAI constructor to automatically instrument all client instances.
 */
export class SentryOpenAiInstrumentation extends InstrumentationBase {
  private _isPatched = false;
  private _callbacks: (() => void)[] = [];

  public constructor(config: InstrumentationConfig = {}) {
    super('@sentry/instrumentation-openai', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition('openai', ['>=4.0.0'], this._patch.bind(this));
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
   * Patches OpenAI constructor to automatically instrument client instances.
   */
  private _patch(moduleExports: PatchedModuleExports): unknown {
    this._isPatched = true;

    this._callbacks.forEach(callback => callback());
    this._callbacks = [];

    const OriginalOpenAI = moduleExports.OpenAI;

    function PatchedOpenAI(this: any, ...args: any[]) {
      // Call original constructor
      const instance = new OriginalOpenAI(...args);

      // Get integration options
      const client = getCurrentScope().getClient();
      const integration = client?.getIntegrationByName<OpenAiIntegration>(INTEGRATION_NAME);
      const integrationOptions = integration?.options;
      const shouldRecordInputsAndOutputs = integration ? Boolean(client?.getOptions().sendDefaultPii) : false;

      const { recordInputs, recordOutputs } = determineRecordingSettings(
        integrationOptions,
        shouldRecordInputsAndOutputs,
      );

      // Return instrumented instance
      return instrumentOpenAiClient(instance, {
        recordInputs,
        recordOutputs,
      });
    }

    // Copy static properties and prototype
    Object.setPrototypeOf(PatchedOpenAI, OriginalOpenAI);
    Object.setPrototypeOf(PatchedOpenAI.prototype, OriginalOpenAI.prototype);
    
    // Copy static properties
    for (const key of Object.getOwnPropertyNames(OriginalOpenAI)) {
      if (key !== 'length' && key !== 'name' && key !== 'prototype') {
        try {
          (PatchedOpenAI as any)[key] = (OriginalOpenAI as any)[key];
        } catch {
          // Ignore non-configurable properties
        }
      }
    }

    // Is this an ESM module?
    if (Object.prototype.toString.call(moduleExports) === '[object Module]') {
      moduleExports.OpenAI = PatchedOpenAI;
      return moduleExports;
    } else {
      // CJS module
      return { ...moduleExports, OpenAI: PatchedOpenAI };
    }
  }
}