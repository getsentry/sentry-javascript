import * as fs from 'fs';
import * as assert from 'assert/strict';

const stdin = fs.readFileSync(0).toString();

// Assert that all static components stay static and all dynamic components stay dynamic

assert.match(stdin, /○ \/client-component/);
assert.match(stdin, /● \/client-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(stdin, /● \/client-component\/parameter\/\[parameter\]/);

assert.match(stdin, /λ \/server-component/);
assert.match(stdin, /λ \/server-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(stdin, /λ \/server-component\/parameter\/\[parameter\]/);

// Assert that all static route hndlers stay static and all dynamic route handlers stay dynamic

assert.match(stdin, /λ \/dynamic-route\/\[\.\.\.parameters\]/);
assert.match(stdin, /λ \/dynamic-route\/\[parameter\]/);
assert.match(stdin, /λ \/dynamic-route\/captureException\/\[\.\.\.parameters\]/);
assert.match(stdin, /λ \/dynamic-route\/captureException\/\[parameter\]/);
assert.match(stdin, /λ \/dynamic-route\/error\/\[\.\.\.parameters\]/);
assert.match(stdin, /λ \/dynamic-route\/error\/\[parameter\]/);

// assert.match(stdin, /● \/static-route/);
