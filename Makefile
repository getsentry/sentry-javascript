RAVEN = ./src/raven.js
PARSEURI = ./src/vendor/uri.js
VER = $(shell cat version.txt)
RAVEN_FULL = ./dist/raven-${VER}.js
RAVEN_MIN = ./dist/raven-${VER}.min.js
TMP = /tmp/raven.min.js

COMPRESSOR ?= `which yuicompressor`

.PHONY: test

#
# Build the compressed all-in-one file
#

raven:
	mkdir -p dist

	# Generate the full and compressed distributions
	cat ${PARSEURI} ${RAVEN} | \
		sed "s/@VERSION/${VER}/" > ${RAVEN_FULL}

	cat ${RAVEN_FULL} | ${COMPRESSOR} --type js > ${RAVEN_MIN}

	# Prepend the tiny header to the compressed file
	echo "/* Raven.js v${VER} | https://github.com/getsentry/raven-js/ */" | \
		cat - ${RAVEN_MIN} > ${TMP}
	mv ${TMP} ${RAVEN_MIN}

test:
	jshint .
	phantomjs phantom-js-loader.js
	phantomjs phantom-js-loader.js zepto
