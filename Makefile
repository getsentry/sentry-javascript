prepare-release:
	yarn clean
	yarn build
	yarn lint
	yarn test
.PHONY: prepare-release

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
