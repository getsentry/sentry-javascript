import { GLOBAL_OBJ } from './worldwide';

const WINDOW = GLOBAL_OBJ as unknown as Window;

/**
 * A safe form of location.href
 */
export function getLocationHref(): string {
  try {
    return WINDOW.document.location.href;
  } catch {
    return '';
  }
}
