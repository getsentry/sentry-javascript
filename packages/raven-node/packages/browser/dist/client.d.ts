import { BaseClient } from '@sentry/core';
import { SdkInfo } from '@sentry/types';
import { BrowserBackend, BrowserOptions } from './backend';
/**
 * The Sentry Browser SDK Client.
 *
 * @see BrowserOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export declare class BrowserClient extends BaseClient<BrowserBackend, BrowserOptions> {
    /**
     * Creates a new Browser SDK instance.
     *
     * @param options Configuration options for this SDK.
     */
    constructor(options: BrowserOptions);
    /**
     * @inheritDoc
     */
    protected getSdkInfo(): SdkInfo;
    /**
     * Instruments the given function and sends an event to Sentry every time the
     * function throws an exception.
     *
     * @param fn A function to wrap.
     * @returns The wrapped function.
     */
    wrap(fn: Function, options: object): Function;
}
