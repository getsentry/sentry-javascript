# `tsconfig` Templates

Every package should get its own copy of these three files. Package-specific options should go in `tsconfig.json` and
test-specific options in `tsconfig.test.json`. The `types` file shouldn't need to be modified, and only exists because
tsconfigs don't support multiple inheritence.
