bump:
	yarn lerna publish --exact --skip-git --skip-npm

prepare-release:
	yarn clean
	yarn build
	yarn lint
	yarn test

publish:
	cd packages/browser; npm publish
	cd packages/core; npm publish
	cd packages/hub; npm publish
	cd packages/minimal; npm publish
	cd packages/node; npm publish
	cd packages/types; npm publish
	cd packages/typescript; npm publish
	cd packages/utils; npm publish

publish-cdn:
  node scripts/browser-upload-cdn.js
