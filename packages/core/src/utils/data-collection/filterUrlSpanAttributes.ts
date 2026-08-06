import { URL_FULL, URL_QUERY } from '@sentry/conventions/attributes';
import type { RawAttributes } from '../../attributes';
import { isAttributeObject } from '../../attributes';
import type { CollectBehavior } from '../../types/datacollection';
import type { StreamedSpanJSON } from '../../types/span';
import { filterQueryParams } from './filterQueryParams';
import { filterUrlQuery } from './filterUrlQuery';

/**
 * Applies `dataCollection.urlQueryParams` to the URL attributes of a span.
 *
 * Filtering centrally rather than at each write site means an
 * integration cannot leak a query string by forgetting to gate its own write.
 *
 * The trade-off is that this cannot tell an SDK-set attribute from one a user set themselves, so a
 * `url.full` set via `span.setAttribute()` is filtered as well, even though `dataCollection` is only
 * meant to gate automatically collected data.
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
 * attribute object (`{ value, type }`) — both shapes are valid on a span. Clears the attribute when
 * `map` returns `undefined`; serialization drops `undefined` values.
 */
function mapStringAttribute(
  attributes: RawAttributes<Record<string, unknown>>,
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
    attributes[key] = undefined;
  } else if (isWrapped) {
    attributes[key] = { ...rawValue, value: mapped };
  } else {
    attributes[key] = mapped;
  }
}
