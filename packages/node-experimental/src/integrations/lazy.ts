import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

/** TODO */
export abstract class NodePerformanceIntegration<IntegrationOptions> {
  protected _options: IntegrationOptions;
  protected _unload?: () => void;

  public constructor(options: IntegrationOptions) {
    this._options = options;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const instrumentations = this.setupInstrumentation(this._options);

    if (!instrumentations) {
      return;
    }

    // Register instrumentations we care about
    this._unload = registerInstrumentations({
      instrumentations,
    });
  }

  /**
   *  Unregister this integration.
   */
  public unregister(): void {
    this._unload?.();
  }

  // Return the instrumentation(s) needed for this integration.
  public abstract setupInstrumentation(options: IntegrationOptions): Instrumentation[] | void;
}
