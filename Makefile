RAVEN = ./src/raven.js
VERSION ?= $(shell cat version.txt)
RAVEN_FULL = ./dist/raven.js
RAVEN_MIN = ./dist/raven.min.js
BRANCH = $(shell git rev-parse --short --abbrev-ref HEAD)
TMP = /tmp/raven.min.js
TEST = test/test.html

REPORTER = dot

# Third party dependencies
DEPENDENCIES = \
	./vendor/TraceKit/tracekit.js


develop: update-submodules
	npm install .

update-submodules:
	git submodule init
	git submodule update

docs:
	cd docs; $(MAKE) html

docs-live:
	while true; do \
		sleep 2; \
		$(MAKE) docs; \
	done

#
# Build the compressed all-in-one file
#

raven: clean
	mkdir -p dist

	# Generate the full and compressed distributions
	cat ${DEPENDENCIES} ./template/_header.js ${RAVEN} ./template/_footer.js | \
		sed "s/@VERSION/${VERSION}/" >> ${RAVEN_FULL}

	./node_modules/.bin/uglifyjs -m -c -o ${RAVEN_MIN} ${RAVEN_FULL}

	# Prepend the tiny header to the compressed file
	echo "/* Raven.js ${VERSION} | https://github.com/getsentry/raven-js/ */" | \
		cat - ${RAVEN_MIN} > ${TMP}
	mv ${TMP} ${RAVEN_MIN}

test:
	@./node_modules/.bin/jshint .
	@./node_modules/.bin/mocha-phantomjs -R ${REPORTER} ${TEST}

test-in-the-cloud:
	@if [ ! -f Sauce-Connect.jar ]; then \
		echo "Downloading Sauce Connect..."; \
		curl https://saucelabs.com/downloads/Sauce-Connect-latest.zip > Sauce-Connect-latest.zip; \
		unzip Sauce-Connect-latest Sauce-Connect.jar; \
		rm Sauce-Connect-latest.zip; \
	fi
	@echo "Booting up Sauce Connect. This will take a while..."
	@$(MAKE) runserver 2>&1 > /dev/null &
	@java -jar Sauce-Connect.jar raven-js b39f5c10-ec75-40ce-8ca3-56727f2901f3 2>&1 > /dev/null &
	@sleep 45
	@clear
	@node runtests.js

FAR_FUTURE = $(shell TZ=GMT date -v+1y "+%a, %d %h %Y %T %Z")
FAR_FUTURE_OPTIONS = --acl-public --guess-mime-type --add-header "Cache-Control: public, max-age=30672000" --add-header "Expires: ${FAR_FUTURE}" --add-header "Content-Encoding: gzip"
release: raven
	gzip -6 dist/raven.js
	mv dist/raven.js.gz dist/raven.js
	gzip -6 dist/raven.min.js
	mv dist/raven.min.js.gz dist/raven.min.js
	s3cmd put ${FAR_FUTURE_OPTIONS} dist/raven.js s3://getsentry-cdn/dist/${VERSION}/raven.js
	s3cmd put ${FAR_FUTURE_OPTIONS} dist/raven.min.js s3://getsentry-cdn/dist/${VERSION}/raven.min.js

SHORT_FUTURE = $(shell TZ=GMT date -v+30M "+%a, %d %h %Y %T %Z")
SHORT_FUTURE_OPTIONS = --acl-public --guess-mime-type --add-header "Cache-Control: public, max-age=1800" --add-header "Expires: ${SHORT_FUTURE}" --add-header "Content-Encoding: gzip"
build:
	VERSION=$(shell git rev-parse --short HEAD) $(MAKE) raven
	gzip -6 dist/raven.js
	mv dist/raven.js.gz dist/raven.js
	gzip -6 dist/raven.min.js
	mv dist/raven.min.js.gz dist/raven.min.js
	s3cmd put ${SHORT_FUTURE_OPTIONS} dist/raven.js s3://getsentry-cdn/build/${BRANCH}/raven.js
	s3cmd put ${SHORT_FUTURE_OPTIONS} dist/raven.min.js s3://getsentry-cdn/build/${BRANCH}/raven.min.js

PORT = 8888
runserver:
	python -m SimpleHTTPServer ${PORT}

clean:
	rm -rf dist

install-hooks:
	cp -rfp hooks/* .git/hooks

.PHONY: develop update-submodules docs docs-live raven test test-in-the-cloud develop release build clean runserver install-hooks
