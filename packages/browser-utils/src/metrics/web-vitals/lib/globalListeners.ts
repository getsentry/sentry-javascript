import { WINDOW } from '../../../types';

/**
 * web-vitals 5.1.0 switched listeners to be added on the window rather than the document.
 * Instead of having to check for window/document every time we add a listener, we can use this function.
 */
export function addPageListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) {
  if (WINDOW.document) {
    WINDOW.addEventListener(type, listener, options);
  }
}
/**
 * web-vitals 5.1.0 switched listeners to be removed from the window rather than the document.
 * Instead of having to check for window/document every time we remove a listener, we can use this function.
 */
export function removePageListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) {
  if (WINDOW.document) {
    WINDOW.removeEventListener(type, listener, options);
  }
}
