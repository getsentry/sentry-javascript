/**
 * @types/node doesn't have a `node:inspector/promises` module, maybe because it's still experimental?
 */
declare module 'node:inspector/promises' {
  /**
   * Async Debugger session
   */
  class Session {
    public constructor();

    public connect(): void;
    public connectToMainThread(): void;

    public post(method: 'Debugger.pause' | 'Debugger.resume' | 'Debugger.enable' | 'Debugger.disable'): Promise<void>;
    public post(
      method: 'Debugger.setPauseOnExceptions',
      params: Debugger.SetPauseOnExceptionsParameterType,
    ): Promise<void>;
    public post(
      method: 'Runtime.getProperties',
      params: Runtime.GetPropertiesParameterType,
    ): Promise<Runtime.GetPropertiesReturnType>;

    public on(
      event: 'Debugger.paused',
      listener: (message: InspectorNotification<Debugger.PausedEventDataType>) => void,
    ): Session;

    public on(event: 'Debugger.resumed', listener: () => void): Session;
  }
}
