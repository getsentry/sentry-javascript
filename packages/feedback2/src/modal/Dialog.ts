// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars

import { DOCUMENT } from '../constants';

import { createDialogStyles } from './components/Dialog.css';
import type { Props } from './components/renderDialogContent';
import { renderDialogContent } from './components/renderDialogContent';

export type { Props };

export interface DialogComponent {
  /**
   * The dialog element itself
   */
  el: HTMLDialogElement;

  /**
   * The style element for this component
   */
  style: HTMLStyleElement;
}

/**
 *
 */
export function makeDialog(props: Props): DialogComponent {
  const el = DOCUMENT.createElement('dialog');
  el.className = 'dialog';
  el.addEventListener('click', props.onFormClose);
  el.open = true;
  renderDialogContent(el, {
    ...props,
  });
  const style = createDialogStyles();

  return {
    get el() {
      return el;
    },
    get style() {
      return style;
    },
  };
}
