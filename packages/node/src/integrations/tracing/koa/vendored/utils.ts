/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-koa
 * - Upstream version: @opentelemetry/instrumentation-koa@0.66.0
 */
/* eslint-disable */

import { KoaLayerType, KoaInstrumentationConfig } from './types';
import { KoaContext, KoaMiddleware } from './internal-types';
import { AttributeNames } from './enums/AttributeNames';
import { Attributes } from '@opentelemetry/api';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';

export const getMiddlewareMetadata = (
  context: KoaContext,
  layer: KoaMiddleware,
  isRouter: boolean,
  layerPath?: string | RegExp,
): {
  attributes: Attributes;
  name: string;
} => {
  if (isRouter) {
    return {
      attributes: {
        [AttributeNames.KOA_NAME]: layerPath?.toString(),
        [AttributeNames.KOA_TYPE]: KoaLayerType.ROUTER,
        [ATTR_HTTP_ROUTE]: layerPath?.toString(),
      },
      name: context._matchedRouteName || `router - ${layerPath}`,
    };
  } else {
    return {
      attributes: {
        [AttributeNames.KOA_NAME]: layer.name ?? 'middleware',
        [AttributeNames.KOA_TYPE]: KoaLayerType.MIDDLEWARE,
      },
      name: `middleware - ${layer.name}`,
    };
  }
};

/**
 * Check whether the given request is ignored by configuration
 * @param [list] List of ignore patterns
 * @param [onException] callback for doing something when an exception has
 *     occurred
 */
export const isLayerIgnored = (type: KoaLayerType, config?: KoaInstrumentationConfig): boolean => {
  return !!(Array.isArray(config?.ignoreLayersType) && config?.ignoreLayersType?.includes(type));
};
