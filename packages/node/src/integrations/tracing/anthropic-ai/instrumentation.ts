import {
  InstrumentationBase,
  type InstrumentationConfig,
  type InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type { AnthropicAiClient, AnthropicAiOptions } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  ANTHROPIC_AI_INTEGRATION_NAME,
  getClient,
  instrumentAnthropicAiClient,
  SDK_VERSION,
} from '@sentry/core';

const supportedVersions = ['>=0.19.2 <1.0.0'];

type AnthropicAiInstrumentationOptions = InstrumentationConfig & AnthropicAiOptions;

/**
 * Represents the patched shape of the Anthropic AI module export.
 */
interface PatchedModuleExports {
  [key: string]: unknown;
  Anthropic: abstract new (...args: unknown[]) => AnthropicAiClient;
}

/**
 * Sentry Anthropic AI instrumentation using OpenTelemetry.
 */
export class SentryAnthropicAiInstrumentation extends InstrumentationBase<AnthropicAiInstrumentationOptions> {
  public constructor(config: AnthropicAiInstrumentationOptions = {}) {
    super('@sentry/instrumentation-anthropic-ai', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      '@anthropic-ai/sdk',
      supportedVersions,
      this._patch.bind(this),
    );
    return module;
  }

  /**
   * Core patch logic applying instrumentation to the Anthropic AI client constructor.
   */
  private _patch(exports: PatchedModuleExports): PatchedModuleExports | void {
    const Original = exports.Anthropic;

    const config = this.getConfig();

    const WrappedAnthropic = function (this: unknown, ...args: unknown[]) {
      // Check if wrapping should be skipped (e.g., when LangChain is handling instrumentation)
      if (_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)) {
        return Reflect.construct(Original, args) as AnthropicAiClient;
      }

      const instance = Reflect.construct(Original, args);
      const client = getClient();
      const defaultPii = Boolean(client?.getOptions().sendDefaultPii);

      const recordInputs = config.recordInputs ?? defaultPii;
      const recordOutputs = config.recordOutputs ?? defaultPii;

      return instrumentAnthropicAiClient(instance as AnthropicAiClient, {
        recordInputs,
        recordOutputs,
      });
    } as unknown as abstract new (...args: unknown[]) => AnthropicAiClient;

    // Preserve static and prototype chains
    Object.setPrototypeOf(WrappedAnthropic, Original);
    Object.setPrototypeOf(WrappedAnthropic.prototype, Original.prototype);

    for (const key of Object.getOwnPropertyNames(Original)) {
      if (!['length', 'name', 'prototype'].includes(key)) {
        const descriptor = Object.getOwnPropertyDescriptor(Original, key);
        if (descriptor) {
          Object.defineProperty(WrappedAnthropic, key, descriptor);
        }
      }
    }

    // Constructor replacement - handle read-only properties
    // The Anthropic property might have only a getter, so use defineProperty
    try {
      exports.Anthropic = WrappedAnthropic;
    } catch (error) {
      // If direct assignment fails, override the property descriptor
      Object.defineProperty(exports, 'Anthropic', {
        value: WrappedAnthropic,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    // Wrap the default export if it points to the original constructor
    // Constructor replacement - handle read-only properties
    // The Anthropic property might have only a getter, so use defineProperty
    if (exports.default === Original) {
      try {
        exports.default = WrappedAnthropic;
      } catch (error) {
        // If direct assignment fails, override the property descriptor
        Object.defineProperty(exports, 'default', {
          value: WrappedAnthropic,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
    }
    return exports;
  }
}
