import { Integration } from '@sentry/types';
/** Patch toString calls to return proper name for wrapped functions */
export declare class FunctionToString implements Integration {
    /**
     * @inheritDoc
     */
    name: string;
    /**
     * @inheritDoc
     */
    install(): void;
}
