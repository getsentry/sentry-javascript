import { Integration } from '@sentry/types';
/** Global Promise Rejection handler */
export declare class OnUncaughtException implements Integration {
    /**
     * @inheritDoc
     */
    name: string;
    /**
     * @inheritDoc
     */
    install(): void;
}
