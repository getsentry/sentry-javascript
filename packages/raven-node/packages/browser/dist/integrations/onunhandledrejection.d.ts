import { Integration } from '@sentry/types';
/** Global Promise Rejection handler */
export declare class OnUnhandledRejection implements Integration {
    /**
     * @inheritDoc
     */
    name: string;
    /**
     * @inheritDoc
     */
    handler(event: PromiseRejectionEvent): void;
    /**
     * @inheritDoc
     */
    install(): void;
}
