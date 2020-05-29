import { render } from '@testing-library/react';
import * as React from 'react';

import { withProfiler } from '../src/profiler';

describe('withProfiler', () => {
  it("sets displayName properly", () => {
     // tslint:disable-next-line: variable-name
     const HelloWorld = () => <h1>Hello World</h1>;

     // tslint:disable-next-line: variable-name
     const ProfiledComponent = withProfiler(HelloWorld);
     expect(ProfiledComponent.displayName).toBe("profiler(HelloWorld)")
  })
});
