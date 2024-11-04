# `tsconfig` Templates

Every package should get its own copy of the three files in this directory and the one in `test/` (which should go in an
analogous spot in the package). Package-specific options should go in `tsconfig.json` and test-specific options in
`tsconfig.test.json`. The `types` file shouldn't need to be modified, and only exists because tsconfigs don't support
multiple inheritance. The same goes for the file in `test/`, which only exists because VSCode only knows to look for a
file named (exactly) `tsconfig.json`.
