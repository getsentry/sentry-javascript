import { Integration } from '@sentry/types';
/** Wrap timer functions and event targets to catch errors and provide better meta data */
export declare class TryCatch implements Integration {
    /**
     * @inheritDoc
     */
    name: string;
    /**
     * @inheritDoc
     */
    install(): void;
}
