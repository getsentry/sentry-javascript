import { Integration } from '@sentry/types';
/** Global OnError handler */
export declare class OnError implements Integration {
    /**
     * @inheritDoc
     */
    name: string;
    /**
     * @inheritDoc
     */
    handler(...args: any[]): void;
    /**
     * @inheritDoc
     */
    install(): void;
}
