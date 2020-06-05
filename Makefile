prepare-release:
	yarn
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
	mkdir /tmp/sentry-js-docs
	cp -r ./docs /tmp/sentry-js-docs/docs
	cd /tmp/sentry-js-docs && \
	git clone --single-branch --branch gh-pages git@github.com:getsentry/sentry-javascript.git && \
	cp -r /tmp/sentry-js-docs/docs/* /tmp/sentry-js-docs/sentry-javascript/ && \
	cd /tmp/sentry-js-docs/sentry-javascript && \
	git add --all && \
	git commit -m "meta: Update docs" && \
	git push origin gh-pages
.PHONY: publish-docs
