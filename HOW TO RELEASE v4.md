1. Update Changelog and bump version manually with

`yarn lerna version --exact --no-git-tag-version --no-push --include-merged-tags VERSION`

2. Publish it with `craft` by specifying a rev

`craft publish VERSION --rev REV`
