import { URL_FULL, URL_QUERY } from '@sentry/conventions/attributes';
import { isAttributeObject } from '../../attributes';
import type { CollectBehavior } from '../../types/datacollection';
import type { StreamedSpanJSON } from '../../types/span';
import { filterQueryParams } from './filterQueryParams';
import { filterUrlQuery } from './filterUrlQuery';

/**
 * Applies `dataCollection.urlQueryParams` to the URL attributes of a span.
 *
 * This is the safety net for the ~50 places across the SDKs that set `url.full` / `url.query`: filtering
 * centrally means an integration cannot leak a query string by forgetting to gate its own write, and it
 * covers attributes set by users too. Instrumentation on hot paths additionally filters at write time,
 * which is harmless because filtering is idempotent.
 *
 * `url.path` and the span name are deliberately untouched — per spec they never carry a query string.
 */
export function filterUrlSpanAttributes(spanJSON: StreamedSpanJSON, behavior: CollectBehavior): void {
  const attributes = spanJSON.attributes;
  if (!attributes) {
    return;
  }

  mapStringAttribute(attributes, URL_FULL, value => filterUrlQuery(value, behavior));
  mapStringAttribute(attributes, URL_QUERY, value => filterQueryParams(value, behavior));
}

/**
 * Applies `map` to a string attribute, which may be stored either as a bare string or wrapped in an
 * attribute object (`{ value, type }`) — both shapes are valid on a span. Removes the attribute when
 * `map` returns `undefined`.
 */
function mapStringAttribute(
  attributes: NonNullable<StreamedSpanJSON['attributes']>,
  key: string,
  map: (value: string) => string | undefined,
): void {
  const rawValue = attributes[key];
  const isWrapped = isAttributeObject(rawValue);
  const value = isWrapped ? rawValue.value : rawValue;

  if (typeof value !== 'string') {
    return;
  }

  const mapped = map(value);

  if (mapped === undefined) {
    // oxlint-disable-next-line typescript/no-dynamic-delete -- the keys passed here are string constants
    delete attributes[key];
  } else if (isWrapped) {
    attributes[key] = { ...rawValue, value: mapped };
  } else {
    attributes[key] = mapped;
  }
}
