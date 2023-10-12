import { getModuleFromFilename } from '../src/module';

function withFilename(fn: () => void, filename: string) {
  const prevFilename = require.main?.filename;
  if (require.main?.filename) {
    require.main.filename = filename;
  }

  try {
    fn();
  } finally {
    if (require.main && prevFilename) {
      require.main.filename = prevFilename;
    }
  }
}

describe('getModuleFromFilename', () => {
  test('Windows', () => {
    withFilename(() => {
      expect(getModuleFromFilename('C:\\Users\\users\\Tim\\Desktop\\node_modules\\module.js', true)).toEqual('module');
    }, 'C:\\Users\\Tim\\app.js');
  });

  test('POSIX', () => {
    withFilename(() => {
      expect(getModuleFromFilename('/Users/users/Tim/Desktop/node_modules/module.js')).toEqual('module');
    }, '/Users/Tim/app.js');
  });

  test('POSIX .mjs', () => {
    withFilename(() => {
      expect(getModuleFromFilename('/Users/users/Tim/Desktop/node_modules/module.mjs')).toEqual('module');
    }, '/Users/Tim/app.js');
  });

  test('POSIX .cjs', () => {
    withFilename(() => {
      expect(getModuleFromFilename('/Users/users/Tim/Desktop/node_modules/module.cjs')).toEqual('module');
    }, '/Users/Tim/app.js');
  });
});
