import { Breadcrumb, SentryEvent } from '@sentry/types';
export declare type SendMethod = (event: SentryEvent, cb?: (err: any) => void) => void;
/** A HTTP transport module. */
export interface Transport {
    request(options: object | string): void;
}
/** A Raven transport wrapper. */
export interface RavenTransport {
    send(): void;
}
/** A constructor class that creates a RavenTransport. */
export interface TransportClass {
    new (options: {
        transport: Transport;
    }): RavenTransport;
}
/** Provides access to internal raven functionality. */
export interface RavenInternal {
    captureBreadcrumb(breadcrumb: Breadcrumb): void;
    captureException(exception: any, cb?: (event: SentryEvent) => void): void;
    captureMessage(message: string, cb?: (event: SentryEvent) => void): void;
    config(dsn: string, options: object): RavenInternal;
    install(onFatalError?: (error: Error) => void): void;
    send: SendMethod;
    transport: RavenTransport;
    version: string;
    onFatalError(error: Error): void;
    installed: boolean;
    uncaughtErrorHandler(): void;
}
/** Casted raven instance with access to internal functions. */
export declare const Raven: RavenInternal;
export declare const HTTPSTransport: TransportClass, HTTPTransport: TransportClass;
