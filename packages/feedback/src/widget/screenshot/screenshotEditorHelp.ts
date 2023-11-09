import { WINDOW } from '@sentry/browser';
import { FeedbackComponent } from '../../types';
import { createElement } from '../util/createElement';

interface ScreenshotEditorHelpComponent extends FeedbackComponent<HTMLDivElement> {
  setHidden: (hidden: boolean) => void;
  remove: () => void;
}

/**
 *
 */
export function ScreenshotEditorHelp({ hide }: { hide?: boolean } = {}): ScreenshotEditorHelpComponent {
  const contentEl = createElement(
    'div',
    { className: 'screenshot-editor__help__content' },
    'Mark the problem on the screen (press "Enter" to skip)',
  );
  const el = createElement('div', { className: 'screenshot-editor__help', ['aria-hidden']: Boolean(hide) }, contentEl);
  let boundingRect = contentEl.getBoundingClientRect();

  function setHidden(hidden: boolean): void {
    el.setAttribute('aria-hidden', `${hidden}`);
  }

  const handleMouseMove = (e: MouseEvent): void => {
    const { clientX, clientY } = e;
    const { left, bottom, right } = boundingRect;
    const threshold = 50;
    const isNearContent = clientX > left - threshold && clientX < right + threshold && clientY < bottom + threshold;

    if (isNearContent) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  };

  /**
   * Update boundingRect when resized
   */
  function handleResize(): void {
    boundingRect = contentEl.getBoundingClientRect();
  }

  WINDOW.addEventListener('resize', handleResize);
  WINDOW.addEventListener('mousemove', handleMouseMove);

  return {
    get el() {
      return el;
    },

    setHidden,

    remove() {
      WINDOW.removeEventListener('resize', handleResize);
      WINDOW.removeEventListener('mousemove', handleMouseMove);
    },
  };
}
