import { SuccessIcon } from '../components/SuccessIcon';
import { WINDOW } from '../constants';

export interface SuccessMessageProps {
  message: string;
  onClick: () => void;
}

/**
 *
 */
export function SuccessMessage({ message, onClick }: SuccessMessageProps): HTMLDivElement {
  const doc = WINDOW.document;
  const el = doc.createElement('div');
  el.className = 'success-message';
  el.addEventListener('click', onClick);
  el.appendChild(SuccessIcon());
  el.appendChild(doc.createTextNode(message));

  return el;
}
