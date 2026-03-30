import {
  InstrumentationBase,
  type InstrumentationConfig,
  type InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import type { LangChainOptions } from '@sentry/core';
import {
  _INTERNAL_skipAiProviderWrapping,
  ANTHROPIC_AI_INTEGRATION_NAME,
  createLangChainCallbackHandler,
  GOOGLE_GENAI_INTEGRATION_NAME,
  OPENAI_INTEGRATION_NAME,
  SDK_VERSION,
  wrapEmbeddingMethod,
} from '@sentry/core';

const supportedVersions = ['>=0.1.0 <2.0.0'];

type LangChainInstrumentationOptions = InstrumentationConfig & LangChainOptions;

/**
 * Represents the patched shape of LangChain provider package exports
 */
interface PatchedLangChainExports {
  [key: string]: unknown;
}

/**
 * Augments a callback handler list with Sentry's handler if not already present
 */
function augmentCallbackHandlers(handlers: unknown, sentryHandler: unknown): unknown {
  // Handle null/undefined - return array with just our handler
  if (!handlers) {
    return [sentryHandler];
  }

  // If handlers is already an array
  if (Array.isArray(handlers)) {
    // Check if our handler is already in the list
    if (handlers.includes(sentryHandler)) {
      return handlers;
    }
    // Add our handler to the list
    return [...handlers, sentryHandler];
  }

  // If it's a single handler object, convert to array
  if (typeof handlers === 'object') {
    return [handlers, sentryHandler];
  }

  // Unknown type - return original
  return handlers;
}

/**
 * Wraps Runnable methods (invoke, stream, batch) to inject Sentry callbacks at request time
 * Uses a Proxy to intercept method calls and augment the options.callbacks
 */
function wrapRunnableMethod(
  originalMethod: (...args: unknown[]) => unknown,
  sentryHandler: unknown,
  _methodName: string,
): (...args: unknown[]) => unknown {
  return new Proxy(originalMethod, {
    apply(target, thisArg, args: unknown[]): unknown {
      // LangChain Runnable method signatures:
      // invoke(input, options?) - options contains callbacks
      // stream(input, options?) - options contains callbacks
      // batch(inputs, options?) - options contains callbacks

      // Options is typically the second argument
      const optionsIndex = 1;
      let options = args[optionsIndex] as Record<string, unknown> | undefined;

      // If options don't exist or aren't an object, create them
      if (!options || typeof options !== 'object' || Array.isArray(options)) {
        options = {};
        args[optionsIndex] = options;
      }

      // Inject our callback handler into options.callbacks (request time callbacks)
      const existingCallbacks = options.callbacks;
      const augmentedCallbacks = augmentCallbackHandlers(existingCallbacks, sentryHandler);
      options.callbacks = augmentedCallbacks;

      // Call original method with augmented options
      return Reflect.apply(target, thisArg, args);
    },
  }) as (...args: unknown[]) => unknown;
}

/**
 * Sentry LangChain instrumentation using OpenTelemetry.
 */
export class SentryLangChainInstrumentation extends InstrumentationBase<LangChainInstrumentationOptions> {
  public constructor(config: LangChainInstrumentationOptions = {}) {
    super('@sentry/instrumentation-langchain', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   * We patch the BaseChatModel class methods to inject callbacks
   *
   * We hook into provider packages (@langchain/anthropic, @langchain/openai, etc.)
   * because @langchain/core is often bundled and not loaded as a separate module
   */
  public init(): InstrumentationModuleDefinition | InstrumentationModuleDefinition[] {
    const modules: InstrumentationModuleDefinition[] = [];

    // Hook into common LangChain provider packages
    const providerPackages = [
      '@langchain/anthropic',
      '@langchain/openai',
      '@langchain/google-genai',
      '@langchain/mistralai',
      '@langchain/google-vertexai',
      '@langchain/groq',
    ];

    for (const packageName of providerPackages) {
      // In CJS, LangChain packages re-export from dist/index.cjs files.
      // Patching only the root module sometimes misses the real implementation or
      // gets overwritten when that file is loaded. We add a file-level patch so that
      // _patch runs again on the concrete implementation
      modules.push(
        new InstrumentationNodeModuleDefinition(
          packageName,
          supportedVersions,
          this._patch.bind(this),
          exports => exports,
          [
            new InstrumentationNodeModuleFile(
              `${packageName}/dist/index.cjs`,
              supportedVersions,
              this._patch.bind(this),
              exports => exports,
            ),
          ],
        ),
      );
    }

    // Hook into main 'langchain' package to catch initChatModel (v1+)
    modules.push(
      new InstrumentationNodeModuleDefinition(
        'langchain',
        supportedVersions,
        this._patch.bind(this),
        exports => exports,
        [
          // To catch the CJS build that contains ConfigurableModel / initChatModel for v1
          new InstrumentationNodeModuleFile(
            'langchain/dist/chat_models/universal.cjs',
            supportedVersions,
            this._patch.bind(this),
            exports => exports,
          ),
        ],
      ),
    );

    return modules;
  }

  /**
   * Core patch logic - patches chat model and embedding methods
   * This is called when a LangChain provider package is loaded
   */
  private _patch(exports: PatchedLangChainExports): PatchedLangChainExports | void {
    // Skip AI provider wrapping now that LangChain is actually being used
    // This prevents duplicate spans from Anthropic/OpenAI/GoogleGenAI standalone integrations
    _INTERNAL_skipAiProviderWrapping([
      OPENAI_INTEGRATION_NAME,
      ANTHROPIC_AI_INTEGRATION_NAME,
      GOOGLE_GENAI_INTEGRATION_NAME,
    ]);

    const config = this.getConfig();

    // Create a shared handler instance for chat model callbacks
    const sentryHandler = createLangChainCallbackHandler(config);

    // Patch Runnable methods to inject callbacks at request time
    // This directly manipulates options.callbacks that LangChain uses
    this._patchRunnableMethods(exports, sentryHandler);

    // Patch embedding methods to create spans directly
    // Embeddings don't use the callback system, so we wrap the methods themselves
    this._patchEmbeddingsMethods(exports, config);

    return exports;
  }

  /**
   * Patches chat model methods (invoke, stream, batch) to inject Sentry callbacks
   * Finds a chat model class from the provider package exports and patches its prototype methods
   */
  private _patchRunnableMethods(exports: PatchedLangChainExports, sentryHandler: unknown): void {
    // Known chat model class names for each provider
    const knownChatModelNames = [
      'ChatAnthropic',
      'ChatOpenAI',
      'ChatGoogleGenerativeAI',
      'ChatMistralAI',
      'ChatVertexAI',
      'ChatGroq',
      'ConfigurableModel',
    ];

    const exportsToPatch = (exports.universal_exports ?? exports) as Record<string, unknown>;

    const chatModelClass = Object.values(exportsToPatch).find(exp => {
      return typeof exp === 'function' && knownChatModelNames.includes(exp.name);
    }) as { prototype: unknown; name: string } | undefined;

    if (!chatModelClass) {
      return;
    }

    // Patch directly on chatModelClass.prototype
    const targetProto = chatModelClass.prototype as Record<string, unknown>;

    // Skip if already patched (both file-level and module-level hooks resolve to the same prototype)
    if (targetProto.__sentry_patched__) {
      return;
    }
    targetProto.__sentry_patched__ = true;

    // Patch the methods (invoke, stream, batch)
    // All chat model instances will inherit these patched methods
    const methodsToPatch = ['invoke', 'stream', 'batch'] as const;

    for (const methodName of methodsToPatch) {
      const method = targetProto[methodName];
      if (typeof method === 'function') {
        targetProto[methodName] = wrapRunnableMethod(
          method as (...args: unknown[]) => unknown,
          sentryHandler,
          methodName,
        );
      }
    }
  }

  /**
   * Patches embedding class methods (embedQuery, embedDocuments) to create Sentry spans.
   *
   * Unlike chat models which use LangChain's callback system, the Embeddings base class
   * has no callback support. We wrap the methods directly on the prototype.
   *
   * Uses duck-type detection: finds any exported class whose prototype has both
   * embedQuery and embedDocuments as functions.
   */
  private _patchEmbeddingsMethods(exports: PatchedLangChainExports, options: LangChainOptions): void {
    const exportsToPatch = (exports.universal_exports ?? exports) as Record<string, unknown>;

    const embeddingClass = Object.values(exportsToPatch).find(exp => {
      if (typeof exp !== 'function' || !exp.prototype) {
        return false;
      }
      const proto = exp.prototype as Record<string, unknown>;
      return typeof proto.embedQuery === 'function' && typeof proto.embedDocuments === 'function';
    }) as { prototype: Record<string, unknown> } | undefined;

    if (!embeddingClass) {
      return;
    }

    const targetProto = embeddingClass.prototype;

    // Separate dedup guard from chat model patching
    if (targetProto.__sentry_patched_embeddings__) {
      return;
    }
    targetProto.__sentry_patched_embeddings__ = true;

    // Duck-type detection already verified these are functions
    targetProto.embedQuery = wrapEmbeddingMethod(
      targetProto.embedQuery as (...args: unknown[]) => Promise<unknown>,
      options,
    );

    targetProto.embedDocuments = wrapEmbeddingMethod(
      targetProto.embedDocuments as (...args: unknown[]) => Promise<unknown>,
      options,
    );
  }
}
