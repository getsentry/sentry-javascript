import type { Span } from '@sentry/core';
import { SPAN_KIND } from '@sentry/core';
import { DB_NAME, DB_OPERATION, DB_SYSTEM } from '@sentry/conventions/attributes';
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
  DB_SYSTEM_VALUE_DYNAMODB,
} from '../constants';
import type { NormalizedRequest, NormalizedResponse } from '../types';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

function toArray<T>(values: T | T[]): T[] {
  return Array.isArray(values) ? values : [values];
}

export class DynamodbServiceExtension implements ServiceExtension {
  public requestPreSpanHook(normalizedRequest: NormalizedRequest): RequestMetadata {
    const operation = normalizedRequest.commandName;
    const tableName = normalizedRequest.commandInput?.TableName;

    const spanAttributes: Record<string, unknown> = {};

    /* oxlint-disable typescript/no-deprecated -- old-semconv db.* attributes, matched to the OTel aws-sdk integration */
    spanAttributes[DB_SYSTEM] = DB_SYSTEM_VALUE_DYNAMODB;
    spanAttributes[DB_NAME] = tableName;
    spanAttributes[DB_OPERATION] = operation;
    /* oxlint-enable typescript/no-deprecated */

    // `RequestItems` is undefined when no table names are returned; its keys are the table names.
    if (normalizedRequest.commandInput?.TableName) {
      // Necessary for commands with only 1 table name (e.g. CreateTable). Attribute is `TableName`, not keys of `RequestItems`.
      spanAttributes[ATTR_AWS_DYNAMODB_TABLE_NAMES] = [normalizedRequest.commandInput.TableName];
    } else if (normalizedRequest.commandInput?.RequestItems) {
      spanAttributes[ATTR_AWS_DYNAMODB_TABLE_NAMES] = Object.keys(normalizedRequest.commandInput.RequestItems);
    }

    if (operation === 'CreateTable' || operation === 'UpdateTable') {
      // only check for ProvisionedThroughput since ReadCapacityUnits and WriteCapacityUnits are required attributes
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
        spanAttributes[ATTR_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEXES] = toArray(
          normalizedRequest.commandInput.GlobalSecondaryIndexes,
        ).map((x: Record<string, any>) => JSON.stringify(x));
      }

      if (normalizedRequest.commandInput?.LocalSecondaryIndexes) {
        spanAttributes[ATTR_AWS_DYNAMODB_LOCAL_SECONDARY_INDEXES] = toArray(
          normalizedRequest.commandInput.LocalSecondaryIndexes,
        ).map((x: Record<string, any>) => JSON.stringify(x));
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
        spanAttributes[ATTR_AWS_DYNAMODB_ATTRIBUTE_DEFINITIONS] = toArray(
          normalizedRequest.commandInput.AttributeDefinitions,
        ).map((x: Record<string, any>) => JSON.stringify(x));
      }

      if (normalizedRequest.commandInput?.GlobalSecondaryIndexUpdates) {
        spanAttributes[ATTR_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEX_UPDATES] = toArray(
          normalizedRequest.commandInput.GlobalSecondaryIndexUpdates,
        ).map((x: Record<string, any>) => JSON.stringify(x));
      }
    }

    return {
      spanAttributes,
      spanKind: SPAN_KIND.CLIENT,
    };
  }

  public responseHook(response: NormalizedResponse, span: Span): void {
    if (response.data?.ConsumedCapacity) {
      span.setAttribute(
        ATTR_AWS_DYNAMODB_CONSUMED_CAPACITY,
        toArray(response.data.ConsumedCapacity).map((x: Record<string, any>) => JSON.stringify(x)),
      );
    }

    if (response.data?.ItemCollectionMetrics) {
      span.setAttribute(
        ATTR_AWS_DYNAMODB_ITEM_COLLECTION_METRICS,
        toArray(response.data.ItemCollectionMetrics).map((x: Record<string, any>) => JSON.stringify(x)),
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
