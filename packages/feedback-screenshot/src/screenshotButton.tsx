import {h, render} from 'preact';
import {useState, useCallback} from 'preact/hooks';
import type {VNode} from 'preact';

export function ScreenshotButton(): VNode {
  const [clicked, setClicked] = useState(false);
  const handleClick = useCallback(() => {
    setClicked(prev => !prev);
  }, []);

  return (
    <label htmlFor="screenshot" className="form__label">
      <span className="form__label__text">Screenshot</span>
      <button class="btn btn--default" type="screenshot" onClick={handleClick}>
        {clicked ? 'Remove' : 'Add'}
      </button>
    </label>
  );
}
