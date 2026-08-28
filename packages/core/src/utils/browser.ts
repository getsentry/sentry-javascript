import { GLOBAL_OBJ } from './worldwide';

const WINDOW = GLOBAL_OBJ as unknown as Window;

type SimpleNode = {
  parentNode: SimpleNode;
} | null;

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
