# `tsconfig` Templates

Every package should get its own copy of these four files. Package-specific options should go in `tsconfig.json` and
test-specific options in `tsconfig.test.json`. The `cjs` and `esm` files shouldn't need to be modified, and only exist
because tsconfigs don't support multiple inheritence.
