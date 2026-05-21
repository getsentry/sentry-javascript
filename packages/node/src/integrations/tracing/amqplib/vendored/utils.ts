/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-amqplib
 * - Upstream version: @opentelemetry/instrumentation-amqplib@0.65.0
 * - Some types vendored from @types/amqplib with simplifications
 */
/* eslint-disable */

import { Context, createContextKey, diag, HrTime, Span, Attributes, AttributeValue } from '@opentelemetry/api';
import { SemconvStability } from '@opentelemetry/instrumentation';
import { ATTR_SERVER_ADDRESS, ATTR_SERVER_PORT } from '@opentelemetry/semantic-conventions';
import { ATTR_MESSAGING_SYSTEM, ATTR_NET_PEER_NAME, ATTR_NET_PEER_PORT } from './semconv';
import { ATTR_MESSAGING_PROTOCOL, ATTR_MESSAGING_PROTOCOL_VERSION, ATTR_MESSAGING_URL } from './semconv-obsolete';
import type { Connection, Channel, ConfirmChannel, Options } from './amqplib-types';
import type { ConsumeMessage, Message } from './types';

export const MESSAGE_STORED_SPAN: unique symbol = Symbol('opentelemetry.amqplib.message.stored-span');
export const CHANNEL_SPANS_NOT_ENDED: unique symbol = Symbol('opentelemetry.amqplib.channel.spans-not-ended');
export const CHANNEL_CONSUME_TIMEOUT_TIMER: unique symbol = Symbol(
  'opentelemetry.amqplib.channel.consumer-timeout-timer',
);
export const CONNECTION_ATTRIBUTES: unique symbol = Symbol('opentelemetry.amqplib.connection.attributes');

export type InstrumentationConnection = Connection & {
  [CONNECTION_ATTRIBUTES]?: Attributes;
};
export type InstrumentationPublishChannel = (Channel | ConfirmChannel) & {
  connection: InstrumentationConnection;
};
export type InstrumentationConsumeChannel = Channel & {
  connection: InstrumentationConnection;
  [CHANNEL_SPANS_NOT_ENDED]?: {
    msg: ConsumeMessage;
    timeOfConsume: HrTime;
  }[];
  [CHANNEL_CONSUME_TIMEOUT_TIMER]?: NodeJS.Timeout;
};
export type InstrumentationMessage = Message & {
  [MESSAGE_STORED_SPAN]?: Span;
};
export type InstrumentationConsumeMessage = ConsumeMessage & {
  [MESSAGE_STORED_SPAN]?: Span;
};

const IS_CONFIRM_CHANNEL_CONTEXT_KEY: symbol = createContextKey('opentelemetry.amqplib.channel.is-confirm-channel');

export const normalizeExchange = (exchangeName: string) => (exchangeName !== '' ? exchangeName : '<default>');

const censorPassword = (url: string): string => {
  return url.replace(/:[^:@/]*@/, ':***@');
};

const getPort = (portFromUrl: number | undefined, resolvedProtocol: string): number => {
  // we are using the resolved protocol which is upper case
  // this code mimic the behavior of the amqplib which is used to set connection params
  return portFromUrl || (resolvedProtocol === 'AMQP' ? 5672 : 5671);
};

const getProtocol = (protocolFromUrl: string | undefined): string => {
  const resolvedProtocol = protocolFromUrl || 'amqp';
  // the substring removed the ':' part of the protocol ('amqp:' -> 'amqp')
  const noEndingColon = resolvedProtocol.endsWith(':')
    ? resolvedProtocol.substring(0, resolvedProtocol.length - 1)
    : resolvedProtocol;
  // upper cases to match spec
  return noEndingColon.toUpperCase();
};

const getHostname = (hostnameFromUrl: string | undefined): string => {
  // if user supplies empty hostname, it gets forwarded to 'net' package which default it to localhost.
  // https://nodejs.org/docs/latest-v12.x/api/net.html#net_socket_connect_options_connectlistener
  return hostnameFromUrl || 'localhost';
};

const extractConnectionAttributeOrLog = (
  url: string | Options.Connect,
  attributeKey: string,
  attributeValue: AttributeValue,
  nameForLog: string,
): Attributes => {
  if (attributeValue) {
    return { [attributeKey]: attributeValue };
  } else {
    diag.error(`amqplib instrumentation: could not extract connection attribute ${nameForLog} from user supplied url`, {
      url,
    });
    return {};
  }
};

export const getConnectionAttributesFromServer = (conn: Connection): Attributes => {
  const product = conn.serverProperties.product?.toLowerCase?.();
  if (product) {
    return {
      [ATTR_MESSAGING_SYSTEM]: product,
    };
  } else {
    return {};
  }
};

export const getConnectionAttributesFromUrl = (
  url: string | Options.Connect,
  netSemconvStability: SemconvStability,
): Attributes => {
  const attributes: Attributes = {
    [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1', // this is the only protocol supported by the instrumented library
  };

  url = url || 'amqp://localhost';
  if (typeof url === 'object') {
    const connectOptions = url as Options.Connect;

    const protocol = getProtocol(connectOptions?.protocol);
    Object.assign(attributes, {
      ...extractConnectionAttributeOrLog(url, ATTR_MESSAGING_PROTOCOL, protocol, 'protocol'),
    });

    const hostname = getHostname(connectOptions?.hostname);
    if (netSemconvStability & SemconvStability.OLD) {
      Object.assign(attributes, {
        ...extractConnectionAttributeOrLog(url, ATTR_NET_PEER_NAME, hostname, 'hostname'),
      });
    }
    if (netSemconvStability & SemconvStability.STABLE) {
      Object.assign(attributes, {
        ...extractConnectionAttributeOrLog(url, ATTR_SERVER_ADDRESS, hostname, 'hostname'),
      });
    }

    const port = getPort(connectOptions.port, protocol);
    if (netSemconvStability & SemconvStability.OLD) {
      Object.assign(attributes, extractConnectionAttributeOrLog(url, ATTR_NET_PEER_PORT, port, 'port'));
    }
    if (netSemconvStability & SemconvStability.STABLE) {
      Object.assign(attributes, extractConnectionAttributeOrLog(url, ATTR_SERVER_PORT, port, 'port'));
    }
  } else {
    const censoredUrl = censorPassword(url);
    attributes[ATTR_MESSAGING_URL] = censoredUrl;
    try {
      const urlParts = new URL(censoredUrl);

      const protocol = getProtocol(urlParts.protocol);
      Object.assign(attributes, {
        ...extractConnectionAttributeOrLog(censoredUrl, ATTR_MESSAGING_PROTOCOL, protocol, 'protocol'),
      });

      const hostname = getHostname(urlParts.hostname);
      if (netSemconvStability & SemconvStability.OLD) {
        Object.assign(attributes, {
          ...extractConnectionAttributeOrLog(censoredUrl, ATTR_NET_PEER_NAME, hostname, 'hostname'),
        });
      }
      if (netSemconvStability & SemconvStability.STABLE) {
        Object.assign(attributes, {
          ...extractConnectionAttributeOrLog(censoredUrl, ATTR_SERVER_ADDRESS, hostname, 'hostname'),
        });
      }

      const port = getPort(urlParts.port ? parseInt(urlParts.port) : undefined, protocol);
      if (netSemconvStability & SemconvStability.OLD) {
        Object.assign(attributes, extractConnectionAttributeOrLog(censoredUrl, ATTR_NET_PEER_PORT, port, 'port'));
      }
      if (netSemconvStability & SemconvStability.STABLE) {
        Object.assign(attributes, extractConnectionAttributeOrLog(censoredUrl, ATTR_SERVER_PORT, port, 'port'));
      }
    } catch (err) {
      diag.error('amqplib instrumentation: error while extracting connection details from connection url', {
        censoredUrl,
        err,
      });
    }
  }
  return attributes;
};

export const markConfirmChannelTracing = (context: Context) => {
  return context.setValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY, true);
};

export const unmarkConfirmChannelTracing = (context: Context) => {
  return context.deleteValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY);
};

export const isConfirmChannelTracing = (context: Context) => {
  return context.getValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY) === true;
};
