import type ApplicationInstance from '@ember/application/instance';
import type RouterService from '@ember/routing/router-service';
import type { EmberRouterMain, EmberSentryConfig, StartTransactionFunction } from '../types';
export declare function initialize(appInstance: ApplicationInstance): void;
export declare function _instrumentEmberRouter(routerService: RouterService, routerMain: EmberRouterMain, config: EmberSentryConfig, startTransaction: StartTransactionFunction, startTransactionOnPageLoad?: boolean): {
    startTransaction: StartTransactionFunction;
};
export declare function instrumentForPerformance(appInstance: ApplicationInstance): Promise<void>;
declare const _default: {
    initialize: typeof initialize;
};
export default _default;
