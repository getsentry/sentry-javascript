import type { BrowserOptions, BrowserTracing } from '@sentry/browser';
import type { Transaction, TransactionContext } from '@sentry/types';
type BrowserTracingOptions = ConstructorParameters<typeof BrowserTracing>[0];
export type EmberSentryConfig = {
    sentry: BrowserOptions & {
        browserTracingOptions?: BrowserTracingOptions;
    };
    transitionTimeout: number;
    ignoreEmberOnErrorWarning: boolean;
    disableInstrumentComponents: boolean;
    disablePerformance: boolean;
    disablePostTransitionRender: boolean;
    disableRunloopPerformance: boolean;
    disableInitialLoadInstrumentation: boolean;
    enableComponentDefinitions: boolean;
    minimumRunloopQueueDuration: number;
    minimumComponentRenderDuration: number;
    browserTracingOptions: BrowserTracingOptions;
};
export type OwnConfig = {
    sentryConfig: EmberSentryConfig;
};
export interface EmberRouterMain {
    location: {
        getURL?: () => string;
        formatURL?: (url: string) => string;
        implementation: string;
        rootURL: string;
    };
}
export type StartTransactionFunction = (context: TransactionContext) => Transaction | undefined;
export type GlobalConfig = {
    __sentryEmberConfig: EmberSentryConfig['sentry'];
};
export {};
