/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { createDialogStyles } from '../../../src/modal/components/Dialog.css';

/**
 * Returns the declarations inside the first rule block matching `selector`, so
 * assertions target one rule rather than the whole stylesheet.
 */
function getRuleBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  return match ? match[1] : '';
}

describe('createDialogStyles', () => {
  it('lets long error messages wrap instead of overflowing the dialog', () => {
    const css = createDialogStyles().textContent ?? '';
    const rule = getRuleBlock(css, '.form__error-container');

    // Guard: if the selector is renamed, fail loudly rather than pass vacuously.
    expect(rule).not.toBe('');
    // `FeedbackErrorMessages` lets integrators supply arbitrary error copy, and
    // the container is only 272px wide while the screenshot editor is open, so a
    // single long token must be breakable.
    expect(rule).toMatch(/overflow-wrap:\s*break-word/);
  });

  // `overflow-wrap` alone does not reduce an element's min-content contribution,
  // so every flex item between the error and the fixed-width column keeps
  // `min-width: auto` and stretches to fit the longest token. Without this,
  // `.form__top` pushes `.form__right` past its 272px and the message overflows
  // the dialog even though the text itself is breakable.
  it.each(['.form__top', '.form__error-container'])('lets %s shrink below its content width', selector => {
    const css = createDialogStyles().textContent ?? '';
    const rule = getRuleBlock(css, selector);

    // Guard: if the selector is renamed, fail loudly rather than pass vacuously.
    expect(rule).not.toBe('');
    expect(rule).toMatch(/min-width:\s*0/);
  });

  it('keeps the error colour tokens on the same rule', () => {
    const css = createDialogStyles().textContent ?? '';
    const rule = getRuleBlock(css, '.form__error-container');

    expect(rule).toMatch(/color:\s*var\(--error-color\)/);
    expect(rule).toMatch(/fill:\s*var\(--error-color\)/);
  });

  it('applies the nonce when one is supplied', () => {
    expect(createDialogStyles('abc123').getAttribute('nonce')).toBe('abc123');
    expect(createDialogStyles().hasAttribute('nonce')).toBe(false);
  });
});
