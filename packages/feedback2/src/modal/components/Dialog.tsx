// biome-ignore lint/nursery/noUnusedImports: reason
import { Fragment, h, render } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { VNode } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { DOCUMENT } from '../../constants';
import type { FeedbackFormData } from '../../types';
import { createDialogStyles } from './Dialog.css';
import { DialogContent } from './DialogContent';
import type { Props as DialogContentProps } from './DialogContent';
import { SuccessIcon } from './SuccessIcon';

export interface Props extends DialogContentProps {
  successMessageText: string;
  onDone: () => void;
}

export interface DialogComponent {
  /**
   * The dialog element itself
   */
  el: HTMLElement;

  /**
   * The style element for this component
   */
  style: HTMLStyleElement;
}

/**
 *
 */
export function Dialog(props: Props): DialogComponent {
  const el = DOCUMENT.createElement('div');
  render(<DialogContainer {...props} />, el);

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

function DialogContainer({ onDone, ...props }: Props): VNode {
  const successIconHtml = useMemo(() => {
    const logo = SuccessIcon();
    return { __html: logo.outerHTML };
  }, []);

  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const onSubmitSuccess = useCallback(
    (data: FeedbackFormData) => {
      props.onSubmitSuccess(data);
      setTimeoutId(() => setTimeout(onDone, 5000));
    },
    [onDone],
  );

  return (
    <Fragment>
      {didSubmit ? (
        <div class="success-message" onClick={onDone}>
          {props.successMessageText}
          <span dangerouslySetInnerHTML={successIconHtml} />
        </div>
      ) : (
        <dialog class="dialog" onClick={props.onFormClose} open>
          <DialogContent {...props} onSubmitSuccess={onSubmitSuccess} />
        </dialog>
      )}
    </Fragment>
  );
}
