import * as fs from 'fs';
import * as assert from 'assert/strict';

const stdin = fs.readFileSync(0).toString();

// Assert that all static components stay static and ally dynamic components stay dynamic

assert.match(stdin, /○ \/client-component/);
assert.match(stdin, /● \/client-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(stdin, /● \/client-component\/parameter\/\[parameter\]/);

assert.match(stdin, /λ \/server-component/);
assert.match(stdin, /λ \/server-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(stdin, /λ \/server-component\/parameter\/\[parameter\]/);

export {};
