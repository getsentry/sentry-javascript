import type { Client, Span } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { applyFormDataAttributes, resolveFormDataCapture } from '../../src/utils/formData';

function mockClient(
  captureActionFormDataKeys: Record<string, string | boolean> | undefined,
  httpBodies: string[],
): Client {
  return {
    getOptions: () => ({ captureActionFormDataKeys }),
    getDataCollectionOptions: () => ({ httpBodies }),
  } as unknown as Client;
}

function formDataOf(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.append(key, value);
  }
  return formData;
}

function applyTo(formData: FormData, keys: Record<string, string | boolean> | undefined): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  const span = { setAttribute: (key: string, value: unknown) => void (attributes[key] = value) } as unknown as Span;

  applyFormDataAttributes(span, formData, { keys });

  return attributes;
}

describe('resolveFormDataCapture', () => {
  it('returns the configured keys when set', () => {
    expect(resolveFormDataCapture(mockClient({ username: true }, ['incomingRequest']))).toEqual({
      keys: { username: true },
    });
  });

  it('prefers the configured keys over dataCollection', () => {
    expect(resolveFormDataCapture(mockClient({ username: true }, []))).toEqual({ keys: { username: true } });
  });

  it('captures all fields when only httpBodies opts in', () => {
    expect(resolveFormDataCapture(mockClient(undefined, ['incomingRequest']))).toEqual({ keys: undefined });
  });

  it('captures nothing when neither option opts in', () => {
    expect(resolveFormDataCapture(mockClient(undefined, []))).toBeUndefined();
  });

  it('captures nothing without a client', () => {
    expect(resolveFormDataCapture(undefined)).toBeUndefined();
  });
});

describe('applyFormDataAttributes', () => {
  it('sets only allowlisted fields', () => {
    const attributes = applyTo(formDataOf({ username: 'alice', bio: 'ignored' }), { username: true });

    expect(attributes).toEqual({ 'remix.action_form_data.username': 'alice' });
  });

  it('applies renames', () => {
    const attributes = applyTo(formDataOf({ username: 'alice' }), { username: 'user' });

    expect(attributes).toEqual({ 'remix.action_form_data.user': 'alice' });
  });

  it('sets every field when no keys are configured', () => {
    const attributes = applyTo(formDataOf({ username: 'alice', bio: 'hello' }), undefined);

    expect(attributes).toEqual({ 'remix.action_form_data.username': 'alice', 'remix.action_form_data.bio': 'hello' });
  });

  it('filters sensitive values when capturing all fields', () => {
    const attributes = applyTo(formDataOf({ username: 'alice', password: 'hunter2' }), undefined);

    expect(attributes).toEqual({
      'remix.action_form_data.username': 'alice',
      'remix.action_form_data.password': '[Filtered]',
    });
  });

  it('filters sensitive values even when explicitly allowlisted', () => {
    const attributes = applyTo(formDataOf({ password: 'hunter2' }), { password: true });

    expect(attributes).toEqual({ 'remix.action_form_data.password': '[Filtered]' });
  });

  it('still filters a sensitive field renamed after rename', () => {
    // The denylist matches on the key it is given, and `pw` matches nothing in it. Filtering must
    // therefore run against the original `password` key, before the rename is applied, or the
    // value ships in the clear.
    const attributes = applyTo(formDataOf({ password: 'hunter2' }), { password: 'pw' });

    expect(attributes).toEqual({ 'remix.action_form_data.pw': '[Filtered]' });
  });

  it('reports the filename for file uploads, not the contents', () => {
    const formData = new FormData();
    formData.append('avatar', new Blob(['file contents']), 'avatar.png');

    expect(applyTo(formData, undefined)).toEqual({ 'remix.action_form_data.avatar': 'avatar.png' });
  });

  it('reports a placeholder for unnamed non-string values', () => {
    const formData = new FormData();
    // An appended Blob with no filename reports as `blob` in undici; force the empty-name case.
    formData.append('avatar', new Blob(['x']), '');

    expect(applyTo(formData, undefined)).toEqual({ 'remix.action_form_data.avatar': '[non-string value]' });
  });

  it('sets nothing for an empty form', () => {
    expect(applyTo(new FormData(), undefined)).toEqual({});
  });
});
