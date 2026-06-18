/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-kafkajs
 * - Upstream version: @opentelemetry/instrumentation-kafkajs@0.27.0
 * - Some types vendored from kafkajs with simplifications
 */
/* eslint-disable */

import type { Consumer, Producer } from './kafkajs-types';

export const EVENT_LISTENERS_SET = Symbol('opentelemetry.instrumentation.kafkajs.eventListenersSet');

export interface ConsumerExtended extends Consumer {
  [EVENT_LISTENERS_SET]?: boolean; // flag to identify if the event listeners for instrumentation have been set
}

export interface ProducerExtended extends Producer {
  [EVENT_LISTENERS_SET]?: boolean; // flag to identify if the event listeners for instrumentation have been set
}
