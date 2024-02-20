// biome-ignore lint/nursery/noUnusedImports: reason
import { h, render } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars

import type { DialogComponent } from '../types';
import { DialogBase } from './DialogBase';
import type { Props as BaseProps } from './DialogBase';
import { DialogContent } from './components/DialogContent';
import type { Props as DialogContentProps } from './components/DialogContent';
import { ScreenShotArea } from './components/ScreenShotArea';

export { showSuccessMessage } from './Message';

function renderDialog(parent: HTMLElement, props: DialogContentProps): void {
  render(
    <DialogContent {...props}>
      <ScreenShotArea />
    </DialogContent>,
    parent,
  );
}

/**
 * Feedback dialog component that has the form and screen shot editor
 */
export function Dialog(props: Omit<BaseProps, 'renderDialog'>): DialogComponent {
  return DialogBase({ ...props, renderDialog });
}
