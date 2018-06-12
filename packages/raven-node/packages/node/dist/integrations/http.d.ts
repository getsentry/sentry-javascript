import { Integration } from '@sentry/types';
/** http module integration */
export declare class Http implements Integration {
    /**
     * @inheritDoc
     */
    name: string;
    /**
     * @inheritDoc
     */
    install(): void;
}
