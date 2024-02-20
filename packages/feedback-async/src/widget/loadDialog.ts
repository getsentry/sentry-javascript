import type { DialogComponent } from '../types';
import type { Props as BaseProps } from './DialogBase';
import type { showSuccessMessage } from './Message';

type DialogRenderer = (props: Omit<BaseProps, 'renderDialog'>) => DialogComponent;

type Return = {
  Dialog: DialogRenderer;
  showSuccessMessage: typeof showSuccessMessage;
};

/**
 * Async load the Dialog component for rendering.
 */
export async function loadDialog({ screenshots }: { screenshots: boolean }): Promise<Return> {
  if (screenshots) {
    const { Dialog, showSuccessMessage } = await import('./DialogWithScreenShots');
    return { Dialog, showSuccessMessage };
  } else {
    const { Dialog, showSuccessMessage } = await import('./Dialog');
    return { Dialog, showSuccessMessage };
  }
}
