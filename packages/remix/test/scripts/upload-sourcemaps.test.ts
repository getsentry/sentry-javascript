const newMock = jest.fn();
const uploadSourceMapsMock = jest.fn();
const finalizeMock = jest.fn();
const proposeVersionMock = jest.fn(() => '0.1.2.3.4');

jest.mock('@sentry/cli', () => {
  return jest.fn().mockImplementation(() => {
    return {
      execute: jest.fn(),
      releases: {
        new: newMock,
        uploadSourceMaps: uploadSourceMapsMock,
        finalize: finalizeMock,
        proposeVersion: proposeVersionMock,
      },
    };
  });
});

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
    });
    expect(finalizeMock).toHaveBeenCalledWith('0.1.2.3.4');
  });

  it('should use given buildPath and urlPrefix over the defaults when given.', async () => {
    await createRelease(
      {
        urlPrefix: '~/build/subfolder',
        buildPath: 'public/build/subfolder',
      },
      '~/build/',
      'public/build',
    );

    expect(proposeVersionMock).toHaveBeenCalled();
    expect(newMock).toHaveBeenCalledWith('0.1.2.3.4');
    expect(uploadSourceMapsMock).toHaveBeenCalledWith('0.1.2.3.4', {
      urlPrefix: '~/build/subfolder',
      include: ['public/build/subfolder'],
      useArtifactBundle: true,
    });
    expect(finalizeMock).toHaveBeenCalledWith('0.1.2.3.4');
  });
});

// To avoid `--isolatedModules` flag as we're not importing
// anything for these tests.
export {};
