import { test } from '@playwright/test';
import * as cp from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

import { withTestApp } from '../test-utils';

withTestApp(
  {
    testAppName: 'create-react-app',
    testApplicationPath: path.join(__dirname, '..', 'test-applications', 'create-react-app'),
    dependencyConfigurations: [
      {
        react: '18.2.0',
        'react-dom': '18.2.0',
      },
    ],
    canaryDependencyConfigurations: [
      {
        react: 'latest',
        'react-dom': 'latest',
      },
      {
        react: 'canary',
        'react-dom': 'canary',
      },
    ],
  },
  cwd => {
    test.beforeAll(async () => {
      console.log(cwd);
      console.log(await promisify(cp.exec)('pnpm install', { cwd }));
      console.log(await promisify(cp.exec)('pnpm build', { cwd }));
    });

    test('builds', () => undefined);
  },
);
