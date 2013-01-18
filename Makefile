RAVEN = ./src/raven.js
VER = $(shell cat version.txt)
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
		sed "s/@VERSION/${VER}/" >> ${RAVEN_FULL}

	./node_modules/.bin/uglifyjs -m -c -o ${RAVEN_MIN} ${RAVEN_FULL}

	# Prepend the tiny header to the compressed file
	echo "/* Raven.js v${VER} | https://github.com/getsentry/raven-js/ */" | \
		cat - ${RAVEN_MIN} > ${TMP}
	mv ${TMP} ${RAVEN_MIN}

test:
	@./node_modules/.bin/jshint .
	@./node_modules/.bin/mocha-phantomjs -R ${REPORTER} ${TEST}

release: raven
	s3cmd put --acl-public --guess-mime-type dist/raven.js s3://getsentry-cdn/dist/${VER}/raven.js
	s3cmd put --acl-public --guess-mime-type dist/raven.min.js s3://getsentry-cdn/dist/${VER}/raven.min.js

post-commit: raven
	s3cmd put --acl-public --guess-mime-type dist/raven.js s3://getsentry-cdn/build/${BRANCH}/raven.js
	s3cmd put --acl-public --guess-mime-type dist/raven.min.js s3://getsentry-cdn/build/${BRANCH}/raven.min.js

PORT = 8002
runserver:
	python -m SimpleHTTPServer ${PORT}

clean:
	rm -rf dist

install-hooks:
	cp -rfp hooks/* .git/hooks

.PHONY: raven test develop release post-commit clean runserver install-hooks
