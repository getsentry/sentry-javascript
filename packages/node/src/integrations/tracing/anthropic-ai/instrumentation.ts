import {
  type InstrumentationConfig,
  type InstrumentationModuleDefinition,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type { AnthropicAiClient, AnthropicAiOptions, Integration } from '@sentry/core';
import { ANTHROPIC_AI_INTEGRATION_NAME, getCurrentScope, instrumentAnthropicAiClient, SDK_VERSION } from '@sentry/core';

const supportedVersions = ['>=0.19.2 <1.0.0'];

export interface AnthropicAiIntegration extends Integration {
  options: AnthropicAiOptions;
}

/**
 * Represents the patched shape of the Anthropic AI module export.
 */
interface PatchedModuleExports {
  [key: string]: unknown;
  Anthropic: abstract new (...args: unknown[]) => AnthropicAiClient;
}

/**
 * Determines telemetry recording settings.
 */
function determineRecordingSettings(
  integrationOptions: AnthropicAiOptions | undefined,
  defaultEnabled: boolean,
): { recordInputs: boolean; recordOutputs: boolean } {
  const recordInputs = integrationOptions?.recordInputs ?? defaultEnabled;
  const recordOutputs = integrationOptions?.recordOutputs ?? defaultEnabled;
  return { recordInputs, recordOutputs };
}

/**
 * Sentry Anthropic AI instrumentation using OpenTelemetry.
 */
export class SentryAnthropicAiInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
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

    const WrappedAnthropic = function (this: unknown, ...args: unknown[]) {
      const instance = Reflect.construct(Original, args);
      const scopeClient = getCurrentScope().getClient();
      const integration = scopeClient?.getIntegrationByName<AnthropicAiIntegration>(ANTHROPIC_AI_INTEGRATION_NAME);
      const integrationOpts = integration?.options;
      const defaultPii = Boolean(scopeClient?.getOptions().sendDefaultPii);

      const { recordInputs, recordOutputs } = determineRecordingSettings(integrationOpts, defaultPii);

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
