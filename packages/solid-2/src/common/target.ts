import type { ChangeOrigin } from 'solid-js/attribution';
import { formatOrigin } from 'solid-js/attribution';

/**
 * Solid describes the element an interaction hit as `tag#id "text"`, with up
 * to 30 characters of its text content — a button's label, but also whatever
 * a `<td>` said. The text is user data; unless the SDK is told to keep it,
 * only the element stays: `button#next`.
 */
export function describeTarget(target: string | undefined, keepText: boolean): string | undefined {
  return target === undefined || keepText ? target : target.replace(/ "[^"]*"$/, '');
}

/** `formatOrigin`, with target text handled the same way wherever an origin is named. */
export function describeOrigin(origin: ChangeOrigin, keepText: boolean): string {
  const text = formatOrigin(origin);
  return keepText ? text : text.replace(/ "[^"]*"(?=[)\s]|$)/g, '');
}
