import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

/**
 * The base node performance integration.
 */
export abstract class NodePerformanceIntegration<IntegrationOptions> {
  protected _options: IntegrationOptions;
  protected _unload?: () => void;
  protected _instrumentations?: Instrumentation[] | undefined;

  public abstract name: string;

  public constructor(options: IntegrationOptions) {
    this._options = options;
  }

  /**
   * Load the instrumentation(s) for this integration.
   * Returns `true` if the instrumentations were loaded, else false.
   */
  public loadInstrumentations(): boolean {
    try {
      this._instrumentations = this.setupInstrumentation(this._options) || undefined;
    } catch (error) {
      return false;
    }

    return true;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const instrumentations = this._instrumentations || this.setupInstrumentation(this._options);

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
