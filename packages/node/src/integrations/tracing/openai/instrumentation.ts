import {
  type InstrumentationConfig,
  type InstrumentationModuleDefinition,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type { Integration, OpenAiClient, OpenAiOptions } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  getClient,
  instrumentOpenAiClient,
  OPENAI_INTEGRATION_NAME,
  SDK_VERSION,
} from '@sentry/core';

const supportedVersions = ['>=4.0.0 <7'];

export interface OpenAiIntegration extends Integration {
  options: OpenAiOptions;
}

/**
 * Represents the patched shape of the OpenAI module export.
 */
interface PatchedModuleExports {
  [key: string]: unknown;
  OpenAI: abstract new (...args: unknown[]) => OpenAiClient;
}

/**
 * Determines telemetry recording settings.
 */
function determineRecordingSettings(
  integrationOptions: OpenAiOptions | undefined,
  defaultEnabled: boolean,
): { recordInputs: boolean; recordOutputs: boolean } {
  const recordInputs = integrationOptions?.recordInputs ?? defaultEnabled;
  const recordOutputs = integrationOptions?.recordOutputs ?? defaultEnabled;
  return { recordInputs, recordOutputs };
}

/**
 * Sentry OpenAI instrumentation using OpenTelemetry.
 */
export class SentryOpenAiInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
    super('@sentry/instrumentation-openai', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition('openai', supportedVersions, this._patch.bind(this));
    return module;
  }

  /**
   * Core patch logic applying instrumentation to the OpenAI client constructor.
   */
  private _patch(exports: PatchedModuleExports): PatchedModuleExports | void {
    const Original = exports.OpenAI;

    const WrappedOpenAI = function (this: unknown, ...args: unknown[]) {
      // Check if wrapping should be skipped (e.g., when LangChain is handling instrumentation)
      if (_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)) {
        return Reflect.construct(Original, args) as OpenAiClient;
      }

      const instance = Reflect.construct(Original, args);
      const client = getClient();
      const integration = client?.getIntegrationByName<OpenAiIntegration>(OPENAI_INTEGRATION_NAME);
      const integrationOpts = integration?.options;
      const defaultPii = Boolean(client?.getOptions().sendDefaultPii);

      const { recordInputs, recordOutputs } = determineRecordingSettings(integrationOpts, defaultPii);

      return instrumentOpenAiClient(instance as OpenAiClient, {
        recordInputs,
        recordOutputs,
      });
    } as unknown as abstract new (...args: unknown[]) => OpenAiClient;

    // Preserve static and prototype chains
    Object.setPrototypeOf(WrappedOpenAI, Original);
    Object.setPrototypeOf(WrappedOpenAI.prototype, Original.prototype);

    for (const key of Object.getOwnPropertyNames(Original)) {
      if (!['length', 'name', 'prototype'].includes(key)) {
        const descriptor = Object.getOwnPropertyDescriptor(Original, key);
        if (descriptor) {
          Object.defineProperty(WrappedOpenAI, key, descriptor);
        }
      }
    }

    // Constructor replacement - handle read-only properties
    // The OpenAI property might have only a getter, so use defineProperty
    try {
      exports.OpenAI = WrappedOpenAI;
    } catch (error) {
      // If direct assignment fails, override the property descriptor
      Object.defineProperty(exports, 'OpenAI', {
        value: WrappedOpenAI,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    // Wrap the default export if it points to the original constructor
    // Constructor replacement - handle read-only properties
    // The OpenAI property might have only a getter, so use defineProperty
    if (exports.default === Original) {
      try {
        exports.default = WrappedOpenAI;
      } catch (error) {
        // If direct assignment fails, override the property descriptor
        Object.defineProperty(exports, 'default', {
          value: WrappedOpenAI,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
    }
    return exports;
  }
}
