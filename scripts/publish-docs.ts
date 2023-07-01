import { execSync } from 'child_process';

function buildDocs(): void {
  execSync('rm -rf ./typedoc/docs');
  execSync('yarn generate:typedoc');
}

function publishDocs(): void {
  execSync(`rm -rf /tmp/sentry-js-docs | true
	mkdir /tmp/sentry-js-docs
	cp -r ./typedoc/docs /tmp/sentry-js-docs/docs
	cd /tmp/sentry-js-docs && \
	git clone --single-branch --branch gh-pages git@github.com:getsentry/sentry-javascript.git && \
	cp -r /tmp/sentry-js-docs/docs/* /tmp/sentry-js-docs/sentry-javascript/ && \
	cd /tmp/sentry-js-docs/sentry-javascript && \
	git add --all && \
	git commit -m "meta: Update docs" && \
	git push origin gh-pages`);
}

function run(): void {
  buildDocs();
  publishDocs();
}

run();
