/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-kafkajs
 * - Upstream version: @opentelemetry/instrumentation-kafkajs@0.27.0
 */
/* eslint-disable */

import type { TextMapGetter } from '@opentelemetry/api';

/*
same as open telemetry's `defaultTextMapGetter`,
but also handle case where header is buffer,
adding toString() to make sure string is returned
*/
export const bufferTextMapGetter: TextMapGetter = {
  get(carrier, key) {
    if (!carrier) {
      return undefined;
    }

    const keys = Object.keys(carrier);

    for (const carrierKey of keys) {
      if (carrierKey === key || carrierKey.toLowerCase() === key) {
        return carrier[carrierKey]?.toString();
      }
    }

    return undefined;
  },

  keys(carrier) {
    return carrier ? Object.keys(carrier) : [];
  },
};
