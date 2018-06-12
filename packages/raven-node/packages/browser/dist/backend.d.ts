import { Backend, Options } from '@sentry/core';
import { SentryEvent } from '@sentry/types';
/**
 * Configuration options for the Sentry Browser SDK.
 * @see BrowserClient for more information.
 */
export interface BrowserOptions extends Options {
    /**
     * A pattern for error messages which should not be sent to Sentry. By
     * default, all errors will be sent.
     */
    ignoreErrors?: Array<string | RegExp>;
    /**
     * A pattern for error URLs which should not be sent to Sentry. To whitelist
     * certain errors instead, use {@link Options.whitelistUrls}. By default, all
     * errors will be sent.
     */
    ignoreUrls?: Array<string | RegExp>;
    /**
     * A pattern for error URLs which should exclusively be sent to Sentry. This
     * is the opposite of {@link Options.ignoreUrls}. By default, all errors will
     * be sent.
     */
    whitelistUrls?: Array<string | RegExp>;
    /**
     * Defines a list source code file paths. Only errors including these paths in
     * their stack traces will be sent to Sentry. By default, all errors will be
     * sent.
     */
    includePaths?: Array<string | RegExp>;
}
/** The Sentry Browser SDK Backend. */
export declare class BrowserBackend implements Backend {
    private readonly options;
    /** Creates a new browser backend instance. */
    constructor(options?: BrowserOptions);
    /**
     * @inheritDoc
     */
    install(): boolean;
    /**
     * @inheritDoc
     */
    eventFromException(exception: any): Promise<SentryEvent>;
    /**
     * @inheritDoc
     */
    eventFromMessage(message: string): Promise<SentryEvent>;
    /**
     * @inheritDoc
     */
    sendEvent(event: SentryEvent): Promise<number>;
    /**
     * @inheritDoc
     */
    storeBreadcrumb(): boolean;
    /**
     * @inheritDoc
     */
    storeScope(): void;
}
