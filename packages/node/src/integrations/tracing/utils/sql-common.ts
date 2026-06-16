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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/5a5918fd4f9f16b14c9ef4d3de08ab98c20e5b46/packages/sql-common
 * - Upstream version: @opentelemetry/sql-common@0.41.2
 */

import type { Span } from '@opentelemetry/api';
import { defaultTextMapSetter, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

// NOTE: This function currently is returning false-positives
// in cases where comment characters appear in string literals
// ("SELECT '-- not a comment';" would return true, although has no comment)
function hasValidSqlComment(query: string): boolean {
  const indexOpeningDashDashComment = query.indexOf('--');
  if (indexOpeningDashDashComment >= 0) {
    return true;
  }

  const indexOpeningSlashComment = query.indexOf('/*');
  if (indexOpeningSlashComment < 0) {
    return false;
  }

  const indexClosingSlashComment = query.indexOf('*/');
  return indexOpeningDashDashComment < indexClosingSlashComment;
}

// sqlcommenter specification (https://google.github.io/sqlcommenter/spec/#value-serialization)
// expects us to URL encode based on the RFC 3986 spec (https://en.wikipedia.org/wiki/Percent-encoding),
// but encodeURIComponent does not handle some characters correctly (! ' ( ) *),
// which means we need special handling for this
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
function fixedEncodeURIComponent(str: string) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function addSqlCommenterComment(span: Span, query: string): string {
  if (typeof query !== 'string' || query.length === 0) {
    return query;
  }

  // As per sqlcommenter spec we shall not add a comment if there already is a comment
  // in the query
  if (hasValidSqlComment(query)) {
    return query;
  }

  const propagator = new W3CTraceContextPropagator();
  const headers: { [key: string]: string } = {};
  propagator.inject(trace.setSpan(ROOT_CONTEXT, span), headers, defaultTextMapSetter);

  // sqlcommenter spec requires keys in the comment to be sorted lexicographically
  const sortedKeys = Object.keys(headers).sort();

  if (sortedKeys.length === 0) {
    return query;
  }

  const commentString = sortedKeys
    .map(key => {
      const encodedValue = fixedEncodeURIComponent(headers[key]!);
      return `${key}='${encodedValue}'`;
    })
    .join(',');

  return `${query} /*${commentString}*/`;
}
