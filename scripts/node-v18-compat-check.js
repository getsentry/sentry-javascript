'use strict';

// Verify the Node SDK can be loaded without errors on Node v18.0.0 (the minimum supported version).
// This catches accidental use of Node APIs that don't exist in v18.0.0.
require('./packages/node/build/cjs/index.js');

console.log('Node v18.0.0 compatibility check passed');
