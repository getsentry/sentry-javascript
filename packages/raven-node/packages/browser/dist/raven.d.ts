import { Breadcrumb, SentryEvent } from '@sentry/types';
/** Signature for the Raven send function */
export declare type SendMethod = (event: SentryEvent, cb: (err: any) => void) => void;
/** Provides access to internal raven functionality. */
export interface RavenInternal {
    captureBreadcrumb(breadcrumb: Breadcrumb): void;
    captureException(exception: any): void;
    captureMessage(message: string): void;
    config(dsn: string, options: object): RavenInternal;
    install(): void;
    setBreadcrumbCallback(cb: (b: Breadcrumb) => Breadcrumb | boolean): void;
    wrap(options: object, fn: Function): Function;
    _sendProcessedPayload: SendMethod;
    VERSION: string;
    _handleOnErrorStackInfo(): void;
    _patchFunctionToString(): void;
    _instrumentTryCatch(): void;
    _instrumentBreadcrumbs(): void;
    _isRavenInstalled: boolean;
    _globalOptions: {
        stackTraceLimit: number;
    };
}
/** Casted raven instance with access to internal functions. */
export declare const Raven: RavenInternal;
