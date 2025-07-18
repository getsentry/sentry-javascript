import { beforeEach, describe, expect, it, vi } from 'vitest';

const newMock = vi.fn();
const uploadSourceMapsMock = vi.fn();
const finalizeMock = vi.fn();
const proposeVersionMock = vi.fn(() => '0.1.2.3.4');

const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

// The createRelease script requires the Sentry CLI, which we need to mock so we
// hook require to do this
async function mock(mockedUri: string, stub: any) {
  const { Module } = await import('module');
  // @ts-expect-error test
  Module._load_original = Module._load;
  // @ts-expect-error test
  Module._load = (uri, parent) => {
    if (uri === mockedUri) return stub;
    // @ts-expect-error test
    return Module._load_original(uri, parent);
  };
}

await vi.hoisted(async () =>
  mock(
    '@sentry/cli',
    vi.fn().mockImplementation(() => {
      return {
        execute: vi.fn(),
        releases: {
          new: newMock,
          uploadSourceMaps: uploadSourceMapsMock,
          finalize: finalizeMock,
          proposeVersion: proposeVersionMock,
        },
      };
    }),
  ),
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createRelease } = require('../../scripts/createRelease');

beforeEach(() => {
  newMock.mockClear();
  uploadSourceMapsMock.mockClear();
  finalizeMock.mockClear();
  proposeVersionMock.mockClear();
});

describe('createRelease', () => {
  it('should use release param when given', async () => {
    await createRelease({ release: '0.1.2.3' }, '~/build/', 'public/build');

    expect(proposeVersionMock).not.toHaveBeenCalled();
    expect(newMock).toHaveBeenCalledWith('0.1.2.3');
    expect(uploadSourceMapsMock).toHaveBeenCalledWith('0.1.2.3', {
      urlPrefix: '~/build/',
      include: ['public/build'],
      useArtifactBundle: true,
      live: 'rejectOnError',
    });
    expect(finalizeMock).toHaveBeenCalledWith('0.1.2.3');
  });

  it('should call `proposeVersion` when release param is not given.', async () => {
    await createRelease({}, '~/build/', 'public/build');

    expect(proposeVersionMock).toHaveBeenCalled();
    expect(newMock).toHaveBeenCalledWith('0.1.2.3.4');
    expect(uploadSourceMapsMock).toHaveBeenCalledWith('0.1.2.3.4', {
      urlPrefix: '~/build/',
      include: ['public/build'],
      useArtifactBundle: true,
      live: 'rejectOnError',
    });
    expect(finalizeMock).toHaveBeenCalledWith('0.1.2.3.4');
  });

  it('should use given buildPath and urlPrefix over the defaults when given.', async () => {
    await createRelease(
      {
        urlPrefix: '~/build/',
        buildPath: 'public/build',
      },
      '~/build/',
      'public/build',
    );

    expect(proposeVersionMock).toHaveBeenCalled();
    expect(newMock).toHaveBeenCalledWith('0.1.2.3.4');
    expect(uploadSourceMapsMock).toHaveBeenCalledWith('0.1.2.3.4', {
      urlPrefix: '~/build/',
      include: ['public/build'],
      useArtifactBundle: true,
      live: 'rejectOnError',
    });
    expect(finalizeMock).toHaveBeenCalledWith('0.1.2.3.4');
  });

  it('logs an error when uploadSourceMaps fails', async () => {
    uploadSourceMapsMock.mockRejectedValue(new Error('Failed to upload sourcemaps'));

    await createRelease({}, '~/build/', 'public/build');

    expect(uploadSourceMapsMock).toHaveBeenCalledWith('0.1.2.3.4', {
      urlPrefix: '~/build/',
      include: ['public/build'],
      useArtifactBundle: true,
      live: 'rejectOnError',
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith('[sentry] Failed to upload sourcemaps.');

    expect(finalizeMock).toHaveBeenCalledWith('0.1.2.3.4');
  });

  it('logs an error when finalize fails', async () => {
    finalizeMock.mockRejectedValue(new Error('Failed to finalize release'));

    await createRelease({}, '~/build/', 'public/build');

    expect(consoleWarnSpy).toHaveBeenCalledWith('[sentry] Failed to finalize release.');
  });
});

// To avoid `--isolatedModules` flag as we're not importing
// anything for these tests.
export {};
