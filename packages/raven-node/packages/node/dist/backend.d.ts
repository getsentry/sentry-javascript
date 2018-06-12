import { Backend, Options } from '@sentry/core';
import { SentryEvent } from '@sentry/types';
import { Transport } from './raven';
/**
 * Configuration options for the Sentry Node SDK.
 * @see NodeClient for more information.
 */
export interface NodeOptions extends Options {
    /**
     * Whether unhandled Promise rejections should be captured or not. If true,
     * this will install an error handler and prevent the process from crashing.
     * Defaults to false.
     */
    captureUnhandledRejections?: boolean;
    /**
     * Enables/disables automatic collection of breadcrumbs. Possible values are:
     *
     *  - `false`: all automatic breadcrumb collection disabled (default)
     *  - `true`: all automatic breadcrumb collection enabled
     *  - A dictionary of individual breadcrumb types that can be
     *    enabled/disabled: e.g.: `{ console: true, http: false }`
     */
    autoBreadcrumbs?: {
        [key: string]: boolean;
    } | boolean;
    /** Callback that is executed when a fatal global error occurs. */
    onFatalError?(error: Error): void;
}
/** The Sentry Node SDK Backend. */
export declare class NodeBackend implements Backend {
    private readonly options;
    /** Creates a new Node backend instance. */
    constructor(options?: NodeOptions);
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
    /**
     * Set the transport module used for submitting events.
     *
     * This can be set to modules like "http" or "https" or any other object that
     * provides a `request` method with options.
     *
     * @param transport The transport to use for submitting events.
     */
    setTransport(transport: Transport): void;
}
