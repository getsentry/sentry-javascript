import * as fs from 'fs';
import * as path from 'path';

const testStrings = [`/// <reference types="node" />`];

describe('build', () => {
  test('not contains types', () => {
    const paths = [path.join('./dist'), path.join('./esm')];
    paths.forEach(dir => {
      if (!fs.existsSync(dir)) {
        expect(dir).toBe(`${dir} doesn't exist please build first`);
      }
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        if (file.includes('.d.ts')) {
          testStrings.forEach(testString => {
            expect(fs.readFileSync(path.join(dir, file), 'utf8')).toEqual(expect.not.stringContaining(testString));
          });
        }
      });
    });
  });
});
