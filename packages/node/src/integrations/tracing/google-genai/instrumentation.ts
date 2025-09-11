import {
  type InstrumentationConfig,
  type InstrumentationModuleDefinition,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type { GoogleGenAIClient, GoogleGenAIOptions, Integration } from '@sentry/core';
import { getCurrentScope, GOOGLE_GENAI_INTEGRATION_NAME, instrumentGoogleGenAIClient, SDK_VERSION } from '@sentry/core';

const supportedVersions = ['>=0.10.0 <2'];

export interface GoogleGenAIIntegration extends Integration {
  options: GoogleGenAIOptions;
}

/**
 * Represents the patched shape of the Google GenAI module export.
 */
interface PatchedModuleExports {
  [key: string]: unknown;
  GoogleGenAI?: unknown;
}

/**
 * Determine recording settings based on integration options and default PII setting
 */
function determineRecordingSettings(
  integrationOptions: GoogleGenAIOptions | undefined,
  defaultEnabled: boolean,
): { recordInputs: boolean; recordOutputs: boolean } {
  const recordInputs = integrationOptions?.recordInputs ?? defaultEnabled;
  const recordOutputs = integrationOptions?.recordOutputs ?? defaultEnabled;
  return { recordInputs, recordOutputs };
}

/**
 * Sentry Google GenAI instrumentation using OpenTelemetry.
 */
export class SentryGoogleGenAiInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
    super('@sentry/instrumentation-google-genai', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition('@google/genai', supportedVersions, this._patch.bind(this));
    return module;
  }

  /**
   * Core patch logic applying instrumentation to the Google GenAI client constructor.
   */
  private _patch(exports: PatchedModuleExports): PatchedModuleExports | void {
    const Original = exports.GoogleGenAI;

    if (typeof Original !== 'function') {
      return;
    }

    const WrappedGoogleGenAI = function (this: unknown, ...args: unknown[]): GoogleGenAIClient {
      const instance = Reflect.construct(Original, args);
      const scopeClient = getCurrentScope().getClient();
      const integration = scopeClient?.getIntegrationByName<GoogleGenAIIntegration>(GOOGLE_GENAI_INTEGRATION_NAME);
      const integrationOpts = integration?.options;
      const defaultPii = Boolean(scopeClient?.getOptions().sendDefaultPii);

      const { recordInputs, recordOutputs } = determineRecordingSettings(integrationOpts, defaultPii);

      return instrumentGoogleGenAIClient(instance, {
        recordInputs,
        recordOutputs,
      });
    };

    // Preserve static and prototype chains
    Object.setPrototypeOf(WrappedGoogleGenAI, Original);
    Object.setPrototypeOf(WrappedGoogleGenAI.prototype, Original.prototype);

    for (const key of Object.getOwnPropertyNames(Original)) {
      if (!['length', 'name', 'prototype'].includes(key)) {
        const descriptor = Object.getOwnPropertyDescriptor(Original, key);
        if (descriptor) {
          Object.defineProperty(WrappedGoogleGenAI, key, descriptor);
        }
      }
    }

    // Constructor replacement - handle read-only properties
    // The GoogleGenAI property might have only a getter, so use defineProperty
    try {
      exports.GoogleGenAI = WrappedGoogleGenAI;
    } catch (error) {
      // If direct assignment fails, override the property descriptor
      Object.defineProperty(exports, 'GoogleGenAI', {
        value: WrappedGoogleGenAI,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    // Wrap the default export if it points to the original constructor
    if (exports.default === Original) {
      try {
        exports.default = WrappedGoogleGenAI;
      } catch (error) {
        Object.defineProperty(exports, 'default', {
          value: WrappedGoogleGenAI,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
    }

    return exports;
  }
}
