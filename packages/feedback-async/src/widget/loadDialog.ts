import type { DialogComponent } from '../types';
import type { createDialogStyles } from './Dialog.css';
import type { Props as BaseProps } from './DialogBase';
import type { showSuccessMessage } from './Message';

type DialogRenderer = (props: Omit<BaseProps, 'renderDialog'>) => DialogComponent;

type Return = {
  Dialog: DialogRenderer;
  showSuccessMessage: typeof showSuccessMessage;
  createDialogStyles: typeof createDialogStyles;
};

/**
 * Async load the Dialog component for rendering.
 */
export async function loadDialog({ screenshots }: { screenshots: boolean }): Promise<Return> {
  if (screenshots) {
    const { Dialog, ...rest } = await import('./DialogWithScreenShots');
    return { Dialog, ...rest };
  } else {
    const { Dialog, ...rest } = await import('./Dialog');
    return { Dialog, ...rest };
  }
}
