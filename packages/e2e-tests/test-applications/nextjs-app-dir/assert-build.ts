import * as fs from 'fs';
import * as assert from 'assert/strict';

const buildOutput = fs.readFileSync('.tmp_build_output', 'utf-8');

// Assert that all static components stay static and all dynamic components stay dynamic

assert.match(buildOutput, /○ \/client-component/);
assert.match(buildOutput, /● \/client-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(buildOutput, /● \/client-component\/parameter\/\[parameter\]/);

assert.match(buildOutput, /λ \/server-component/);
assert.match(buildOutput, /λ \/server-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(buildOutput, /λ \/server-component\/parameter\/\[parameter\]/);

export {};
