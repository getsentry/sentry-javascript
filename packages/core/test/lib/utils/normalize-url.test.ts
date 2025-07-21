import { describe, expect, it } from 'vitest';
import { normalizeUrlToBase } from '../../../src/utils/normalize';

describe('normalizeUrlToBase()', () => {
  it('Example app on Windows', () => {
    const base = 'c:/Users/Username/sentry-electron/example';

    expect(normalizeUrlToBase('C:\\Users\\Username\\sentry-electron\\example\\renderer.js', base)).toEqual(
      'app:///renderer.js',
    );

    expect(
      normalizeUrlToBase('C:\\Users\\Username\\sentry-electron\\example\\sub-directory\\renderer.js', base),
    ).toEqual('app:///sub-directory/renderer.js');

    expect(normalizeUrlToBase('file:///C:/Users/Username/sentry-electron/example/index.html', base)).toEqual(
      'app:///index.html',
    );
  });

  it('Example app with parentheses', () => {
    const base = 'c:/Users/Username/sentry-electron (beta)/example';

    expect(normalizeUrlToBase('C:\\Users\\Username\\sentry-electron%20(beta)\\example\\renderer.js', base)).toEqual(
      'app:///renderer.js',
    );

    expect(
      normalizeUrlToBase('C:\\Users\\Username\\sentry-electron%20(beta)\\example\\sub-directory\\renderer.js', base),
    ).toEqual('app:///sub-directory/renderer.js');

    expect(normalizeUrlToBase('file:///C:/Users/Username/sentry-electron%20(beta)/example/index.html', base)).toEqual(
      'app:///index.html',
    );
  });

  it('Asar packaged app in Windows Program Files', () => {
    const base = 'C:/Program Files/My App/resources/app.asar';

    expect(normalizeUrlToBase('/C:/Program%20Files/My%20App/resources/app.asar/dist/bundle-app.js', base)).toEqual(
      'app:///dist/bundle-app.js',
    );

    expect(normalizeUrlToBase('file:///C:/Program%20Files/My%20App/resources/app.asar/index.html', base)).toEqual(
      'app:///index.html',
    );

    expect(normalizeUrlToBase('file:///C:/Program%20Files/My%20App/resources/app.asar/a/index.html', base)).toEqual(
      'app:///a/index.html',
    );
  });

  it('Webpack builds', () => {
    const base = '/home/haza/Desktop/foo/app/';
    expect(
      normalizeUrlToBase('/home/haza/Desktop/foo/app/webpack:/electron/src/common/models/ipc-request.ts', base),
    ).toEqual('app:///electron/src/common/models/ipc-request.ts');
  });

  it('Only modifies file URLS', () => {
    const base = 'c:/Users/Username/sentry-electron/example';
    expect(normalizeUrlToBase('https://some.host/index.html', base)).toEqual('https://some.host/index.html');
    expect(normalizeUrlToBase('http://localhost:43288/index.html', base)).toEqual('http://localhost:43288/index.html');
  });
});
