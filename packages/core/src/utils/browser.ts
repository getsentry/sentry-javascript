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

/**
 * Given a DOM element, traverses up the tree until it finds the first ancestor node
 * that has the `data-sentry-component` or `data-sentry-element` attribute with `data-sentry-component` taking
 * precedence. This attribute is added at build-time by projects that have the component name annotation plugin installed.
 *
 * @returns a string representation of the component for the provided DOM element, or `null` if not found
 */
export function getComponentName(elem: unknown, maxTraverseHeight: number = 5): string | null {
  // @ts-expect-error WINDOW has HTMLElement
  if (!WINDOW.HTMLElement) {
    return null;
  }

  let currentElem = elem as SimpleNode;
  for (let i = 0; i < maxTraverseHeight; i++) {
    if (!currentElem) {
      return null;
    }

    if (currentElem instanceof HTMLElement) {
      if (currentElem.dataset['sentryComponent']) {
        return currentElem.dataset['sentryComponent'];
      }
      if (currentElem.dataset['sentryElement']) {
        return currentElem.dataset['sentryElement'];
      }
    }

    currentElem = currentElem.parentNode;
  }

  return null;
}
