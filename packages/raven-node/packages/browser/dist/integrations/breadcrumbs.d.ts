import { Integration } from '@sentry/types';
/** Default Breadcrumbs instrumentations */
export declare class Breadcrumbs implements Integration {
    /**
     * @inheritDoc
     */
    name: string;
    /**
     * @inheritDoc
     */
    install(): void;
}
