import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'vitest';

const testStrings = ['/// <reference types="node" />'];

const paths = [path.join('./build/cjs'), path.join('./build/esm')];

test('typedef', () => {
  paths.forEach(dir => {
    if (!fs.existsSync(dir)) {
      throw new Error(`${dir} doesn't exist please build first`);
    }
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      if (file.includes('.d.ts')) {
        testStrings.forEach(testString => {
          const filePath = path.join(dir, file);
          if (fs.readFileSync(filePath, 'utf8').includes(testString)) {
            throw new Error(`${filePath} contains types`);
          }
        });
      }
    });
  });
});
