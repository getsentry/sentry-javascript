import { Integration } from '@sentry/types';
/** Console module integration */
export declare class Console implements Integration {
    /**
     * @inheritDoc
     */
    name: string;
    /**
     * @inheritDoc
     */
    install(): void;
}
