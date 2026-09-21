// Deno reports no module format for a `.json` file, so with any load hook
// installed its CJS loader used to compile this JSON as JavaScript.
module.exports = require('./fixture.json');
