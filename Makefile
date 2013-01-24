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

release: raven
	s3cmd put --acl-public --guess-mime-type dist/raven.js s3://getsentry-cdn/dist/${VERSION}/raven.js
	s3cmd put --acl-public --guess-mime-type dist/raven.min.js s3://getsentry-cdn/dist/${VERSION}/raven.min.js

build:
	VERSION=$(shell git rev-parse --short HEAD) $(MAKE) raven
	s3cmd put --acl-public --guess-mime-type --add-header "Cache-control: public, max-age=600" dist/raven.js s3://getsentry-cdn/build/${BRANCH}/raven.js
	s3cmd put --acl-public --guess-mime-type --add-header "Cache-control: public, max-age=600" dist/raven.min.js s3://getsentry-cdn/build/${BRANCH}/raven.min.js

PORT = 8888
runserver:
	python -m SimpleHTTPServer ${PORT}

clean:
	rm -rf dist

install-hooks:
	cp -rfp hooks/* .git/hooks

.PHONY: raven test test-in-the-cloud develop release post-commit clean runserver install-hooks
