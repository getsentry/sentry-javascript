import { WINDOW } from './types';

/**
 * A safe form of location.href.
 */
export function getLocationHref(): string {
  try {
    return WINDOW.document?.location.href ?? '';
  } catch {
    return '';
  }
}
