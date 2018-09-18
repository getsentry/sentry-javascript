bump:
	yarn lerna publish --exact --skip-git --skip-npm

prepare-release:
	yarn clean
	yarn build
	yarn lint
	yarn test

publish-npm:
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

publish-docs:
	node ./node_modules/.bin/typedoc --options ./typedoc.js
	rm -rf /tmp/sentry-js-docs | true
	cp -r ./docs /tmp/sentry-js-docs
	git checkout gh-pages
	cp -r /tmp/sentry-js-docs/* .
	git commit -a -m "meta: Update docs"
	git push origin gh-pages
	git checkout master

release: bump prepare-release publish-docs publish-npm publish-cdn
