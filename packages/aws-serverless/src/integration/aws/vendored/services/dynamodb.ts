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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */
/* eslint-disable */

import {
  DB_NAME,
  DB_NAMESPACE,
  DB_OPERATION,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_STATEMENT,
  DB_SYSTEM,
  DB_SYSTEM_NAME,
} from '@sentry/conventions/attributes';
import { Attributes, DiagLogger, Span, SpanKind, Tracer } from '@opentelemetry/api';
import { SemconvStability } from '@opentelemetry/instrumentation';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import {
  ATTR_AWS_DYNAMODB_ATTRIBUTE_DEFINITIONS,
  ATTR_AWS_DYNAMODB_CONSISTENT_READ,
  ATTR_AWS_DYNAMODB_CONSUMED_CAPACITY,
  ATTR_AWS_DYNAMODB_COUNT,
  ATTR_AWS_DYNAMODB_EXCLUSIVE_START_TABLE,
  ATTR_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEX_UPDATES,
  ATTR_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEXES,
  ATTR_AWS_DYNAMODB_INDEX_NAME,
  ATTR_AWS_DYNAMODB_ITEM_COLLECTION_METRICS,
  ATTR_AWS_DYNAMODB_LIMIT,
  ATTR_AWS_DYNAMODB_LOCAL_SECONDARY_INDEXES,
  ATTR_AWS_DYNAMODB_PROJECTION,
  ATTR_AWS_DYNAMODB_PROVISIONED_READ_CAPACITY,
  ATTR_AWS_DYNAMODB_PROVISIONED_WRITE_CAPACITY,
  ATTR_AWS_DYNAMODB_SCAN_FORWARD,
  ATTR_AWS_DYNAMODB_SCANNED_COUNT,
  ATTR_AWS_DYNAMODB_SEGMENT,
  ATTR_AWS_DYNAMODB_SELECT,
  ATTR_AWS_DYNAMODB_TABLE_COUNT,
  ATTR_AWS_DYNAMODB_TABLE_NAMES,
  ATTR_AWS_DYNAMODB_TOTAL_SEGMENTS,
  DB_SYSTEM_NAME_VALUE_DYNAMODB,
  DB_SYSTEM_VALUE_DYNAMODB,
} from '../semconv';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from '../types';

export class DynamodbServiceExtension implements ServiceExtension {
  toArray<T>(values: T | T[]): T[] {
    return Array.isArray(values) ? values : [values];
  }

  requestPreSpanHook(
    normalizedRequest: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger,
    dbSemconvStability?: SemconvStability,
  ): RequestMetadata {
    const spanKind: SpanKind = SpanKind.CLIENT;
    let spanName: string | undefined;
    const isIncoming = false;
    const operation = normalizedRequest.commandName;
    const tableName = normalizedRequest.commandInput?.TableName;

    const spanAttributes: Attributes = {};

    if (dbSemconvStability === undefined || dbSemconvStability & SemconvStability.OLD) {
      spanAttributes[DB_SYSTEM] = DB_SYSTEM_VALUE_DYNAMODB;
      spanAttributes[DB_NAME] = tableName;
      spanAttributes[DB_OPERATION] = operation;
    }
    if (dbSemconvStability !== undefined && dbSemconvStability & SemconvStability.STABLE) {
      spanAttributes[DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_DYNAMODB;
      spanAttributes[DB_NAMESPACE] = tableName;
      spanAttributes[DB_OPERATION_NAME] = operation;
    }

    if (config.dynamoDBStatementSerializer) {
      try {
        const sanitizedStatement = config.dynamoDBStatementSerializer(operation, normalizedRequest.commandInput);

        if (typeof sanitizedStatement === 'string') {
          if (dbSemconvStability === undefined || dbSemconvStability & SemconvStability.OLD) {
            spanAttributes[DB_STATEMENT] = sanitizedStatement;
          }
          if (dbSemconvStability !== undefined && dbSemconvStability & SemconvStability.STABLE) {
            spanAttributes[DB_QUERY_TEXT] = sanitizedStatement;
          }
        }
      } catch (err) {
        diag.error('failed to sanitize DynamoDB statement', err);
      }
    }

    // normalizedRequest.commandInput.RequestItems) is undefined when no table names are returned
    // keys in this object are the table names
    if (normalizedRequest.commandInput?.TableName) {
      // Necessary for commands with only 1 table name (example: CreateTable). Attribute is TableName not keys of RequestItems
      // single table name returned for operations like CreateTable
      spanAttributes[ATTR_AWS_DYNAMODB_TABLE_NAMES] = [normalizedRequest.commandInput.TableName];
    } else if (normalizedRequest.commandInput?.RequestItems) {
      spanAttributes[ATTR_AWS_DYNAMODB_TABLE_NAMES] = Object.keys(normalizedRequest.commandInput.RequestItems);
    }

    if (operation === 'CreateTable' || operation === 'UpdateTable') {
      // only check for ProvisionedThroughput since ReadCapacityUnits and WriteCapacity units are required attributes
      if (normalizedRequest.commandInput?.ProvisionedThroughput) {
        spanAttributes[ATTR_AWS_DYNAMODB_PROVISIONED_READ_CAPACITY] =
          normalizedRequest.commandInput.ProvisionedThroughput.ReadCapacityUnits;
        spanAttributes[ATTR_AWS_DYNAMODB_PROVISIONED_WRITE_CAPACITY] =
          normalizedRequest.commandInput.ProvisionedThroughput.WriteCapacityUnits;
      }
    }

    if (operation === 'GetItem' || operation === 'Scan' || operation === 'Query') {
      if (normalizedRequest.commandInput?.ConsistentRead) {
        spanAttributes[ATTR_AWS_DYNAMODB_CONSISTENT_READ] = normalizedRequest.commandInput.ConsistentRead;
      }
    }

    if (operation === 'Query' || operation === 'Scan') {
      if (normalizedRequest.commandInput?.ProjectionExpression) {
        spanAttributes[ATTR_AWS_DYNAMODB_PROJECTION] = normalizedRequest.commandInput.ProjectionExpression;
      }
    }

    if (operation === 'CreateTable') {
      if (normalizedRequest.commandInput?.GlobalSecondaryIndexes) {
        spanAttributes[ATTR_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEXES] = this.toArray(
          normalizedRequest.commandInput.GlobalSecondaryIndexes,
        ).map((x: { [DictionaryKey: string]: any }) => JSON.stringify(x));
      }

      if (normalizedRequest.commandInput?.LocalSecondaryIndexes) {
        spanAttributes[ATTR_AWS_DYNAMODB_LOCAL_SECONDARY_INDEXES] = this.toArray(
          normalizedRequest.commandInput.LocalSecondaryIndexes,
        ).map((x: { [DictionaryKey: string]: any }) => JSON.stringify(x));
      }
    }

    if (operation === 'ListTables' || operation === 'Query' || operation === 'Scan') {
      if (normalizedRequest.commandInput?.Limit) {
        spanAttributes[ATTR_AWS_DYNAMODB_LIMIT] = normalizedRequest.commandInput.Limit;
      }
    }

    if (operation === 'ListTables') {
      if (normalizedRequest.commandInput?.ExclusiveStartTableName) {
        spanAttributes[ATTR_AWS_DYNAMODB_EXCLUSIVE_START_TABLE] =
          normalizedRequest.commandInput.ExclusiveStartTableName;
      }
    }

    if (operation === 'Query') {
      if (normalizedRequest.commandInput?.ScanIndexForward) {
        spanAttributes[ATTR_AWS_DYNAMODB_SCAN_FORWARD] = normalizedRequest.commandInput.ScanIndexForward;
      }

      if (normalizedRequest.commandInput?.IndexName) {
        spanAttributes[ATTR_AWS_DYNAMODB_INDEX_NAME] = normalizedRequest.commandInput.IndexName;
      }

      if (normalizedRequest.commandInput?.Select) {
        spanAttributes[ATTR_AWS_DYNAMODB_SELECT] = normalizedRequest.commandInput.Select;
      }
    }

    if (operation === 'Scan') {
      if (normalizedRequest.commandInput?.Segment) {
        spanAttributes[ATTR_AWS_DYNAMODB_SEGMENT] = normalizedRequest.commandInput?.Segment;
      }

      if (normalizedRequest.commandInput?.TotalSegments) {
        spanAttributes[ATTR_AWS_DYNAMODB_TOTAL_SEGMENTS] = normalizedRequest.commandInput?.TotalSegments;
      }

      if (normalizedRequest.commandInput?.IndexName) {
        spanAttributes[ATTR_AWS_DYNAMODB_INDEX_NAME] = normalizedRequest.commandInput.IndexName;
      }

      if (normalizedRequest.commandInput?.Select) {
        spanAttributes[ATTR_AWS_DYNAMODB_SELECT] = normalizedRequest.commandInput.Select;
      }
    }

    if (operation === 'UpdateTable') {
      if (normalizedRequest.commandInput?.AttributeDefinitions) {
        spanAttributes[ATTR_AWS_DYNAMODB_ATTRIBUTE_DEFINITIONS] = this.toArray(
          normalizedRequest.commandInput.AttributeDefinitions,
        ).map((x: { [DictionaryKey: string]: any }) => JSON.stringify(x));
      }

      if (normalizedRequest.commandInput?.GlobalSecondaryIndexUpdates) {
        spanAttributes[ATTR_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEX_UPDATES] = this.toArray(
          normalizedRequest.commandInput.GlobalSecondaryIndexUpdates,
        ).map((x: { [DictionaryKey: string]: any }) => JSON.stringify(x));
      }
    }

    return {
      isIncoming,
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  responseHook(response: NormalizedResponse, span: Span, _tracer: Tracer, _config: AwsSdkInstrumentationConfig) {
    if (response.data?.ConsumedCapacity) {
      span.setAttribute(
        ATTR_AWS_DYNAMODB_CONSUMED_CAPACITY,
        toArray(response.data.ConsumedCapacity).map((x: { [DictionaryKey: string]: any }) => JSON.stringify(x)),
      );
    }

    if (response.data?.ItemCollectionMetrics) {
      span.setAttribute(
        ATTR_AWS_DYNAMODB_ITEM_COLLECTION_METRICS,
        this.toArray(response.data.ItemCollectionMetrics).map((x: { [DictionaryKey: string]: any }) =>
          JSON.stringify(x),
        ),
      );
    }

    if (response.data?.TableNames) {
      span.setAttribute(ATTR_AWS_DYNAMODB_TABLE_COUNT, response.data?.TableNames.length);
    }

    if (response.data?.Count) {
      span.setAttribute(ATTR_AWS_DYNAMODB_COUNT, response.data?.Count);
    }

    if (response.data?.ScannedCount) {
      span.setAttribute(ATTR_AWS_DYNAMODB_SCANNED_COUNT, response.data?.ScannedCount);
    }
  }
}

function toArray<T>(values: T | T[]): T[] {
  return Array.isArray(values) ? values : [values];
}
