bump:
	yarn lerna version --exact --no-git-tag-version --no-push
.PHONY: bump

prepare-release:
	yarn clean
	yarn build
	yarn lint
	yarn test
.PHONY: prepare-release

publish-npm:
	cd packages/browser; npm publish
	cd packages/core; npm publish
	cd packages/hub; npm publish
	cd packages/integrations; npm publish
	cd packages/minimal; npm publish
	cd packages/node; npm publish
	# cd packages/types; npm publish
	# cd packages/typescript; npm publish
	cd packages/utils; npm publish
.PHONY: publish-npm

publish-cdn:
	node scripts/browser-upload-cdn.js
.PHONY: publish-cdn

build-docs:
	rm -rf ./docs
	yarn typedoc --options ./typedoc.js
.PHONY: build-docs

publish-docs: build-docs
	rm -rf /tmp/sentry-js-docs | true
	cp -r ./docs /tmp/sentry-js-docs
	git checkout gh-pages
	cp -r /tmp/sentry-js-docs/* .
	git commit -a -m "meta: Update docs"
	git push origin gh-pages
	git checkout master
.PHONY: publish-docs

release: bump prepare-release publish-npm publish-cdn
.PHONY: release
