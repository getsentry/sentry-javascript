import { getModule } from '../src/module';

describe('getModule', () => {
  test('Windows', async () => {
    (require.main as any) = { filename: 'C:\\Users\\Tim\\app.js' };

    expect(getModule('C:\\Users\\users\\Tim\\Desktop\\node_modules\\module.js')).toEqual('module');
  });

  test('POSIX', async () => {
    (require.main as any) = { filename: '/Users/Tim/app.js' };

    expect(getModule('/Users/users/Tim/Desktop/node_modules/module.js')).toEqual('module');
  });
});
