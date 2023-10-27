import { SUBMIT_BUTTON_LABEL } from '../../src/constants';
import type { SubmitButtonProps } from '../../src/widget/SubmitButton';
import { SubmitButton } from '../../src/widget/SubmitButton';

function renderSubmitButton(props?: Partial<SubmitButtonProps>) {
  return SubmitButton({
    label: SUBMIT_BUTTON_LABEL,
    ...props,
  });
}

describe('SubmitButton', () => {
  it('renders the submit button, disabled by default', () => {
    const submitButtonComponent = renderSubmitButton();

    expect(submitButtonComponent.el).toBeInstanceOf(HTMLButtonElement);
    expect(submitButtonComponent.el.textContent).toBe(SUBMIT_BUTTON_LABEL);
    expect(submitButtonComponent.el.disabled).toBe(true);
    expect(submitButtonComponent.el.getAttribute('ariaDisabled')).toBe('true');
  });

  it('toggles between enabled and disabled', () => {
    const submitButtonComponent = renderSubmitButton();

    submitButtonComponent.setEnabled();
    expect(submitButtonComponent.el.disabled).toBe(false);
    expect(submitButtonComponent.el.ariaDisabled).toBe('false');

    submitButtonComponent.setDisabled();
    expect(submitButtonComponent.el.disabled).toBe(true);
    expect(submitButtonComponent.el.ariaDisabled).toBe('true');
  });
});
