import { h } from 'preact';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function ScreenshotButton() {
  return (
    <label htmlFor="screenshot" className="form__label">
      <span className="form__label__text">Screenshot</span>
      <button class="btn btn--default" type="cancel">
        Add
      </button>
    </label>
  );
}
