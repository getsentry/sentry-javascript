import {
  InstrumentationBase,
  type InstrumentationConfig,
  type InstrumentationModuleDefinition,
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

type OpenAiInstrumentationOptions = InstrumentationConfig & OpenAiOptions;

/**
 * Represents the patched shape of the OpenAI module export.
 */
interface PatchedModuleExports {
  [key: string]: unknown;
  OpenAI: abstract new (...args: unknown[]) => OpenAiClient;
  AzureOpenAI?: abstract new (...args: unknown[]) => OpenAiClient;
}

/**
 * Sentry OpenAI instrumentation using OpenTelemetry.
 */
export class SentryOpenAiInstrumentation extends InstrumentationBase<OpenAiInstrumentationOptions> {
  public constructor(config: OpenAiInstrumentationOptions = {}) {
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
   * Core patch logic applying instrumentation to the OpenAI and AzureOpenAI client constructors.
   */
  private _patch(exports: PatchedModuleExports): PatchedModuleExports | void {
    let result = exports;
    result = this._patchClient(result, 'OpenAI');
    result = this._patchClient(result, 'AzureOpenAI');
    return result;
  }

  /**
   * Patch logic applying instrumentation to the specified client constructor.
   */
  private _patchClient(exports: PatchedModuleExports, exportKey: 'OpenAI' | 'AzureOpenAI'): PatchedModuleExports {
    const Original = exports[exportKey];
    if (!Original) {
      return exports;
    }

    const config = this.getConfig();

    const WrappedOpenAI = function (this: unknown, ...args: unknown[]) {
      // Check if wrapping should be skipped (e.g., when LangChain is handling instrumentation)
      if (_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)) {
        return Reflect.construct(Original, args) as OpenAiClient;
      }

      const instance = Reflect.construct(Original, args);
      const client = getClient();
      const defaultPii = Boolean(client?.getOptions().sendDefaultPii);

      const recordInputs = config.recordInputs ?? defaultPii;
      const recordOutputs = config.recordOutputs ?? defaultPii;

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
      exports[exportKey] = WrappedOpenAI;
    } catch (error) {
      // If direct assignment fails, override the property descriptor
      Object.defineProperty(exports, exportKey, {
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
