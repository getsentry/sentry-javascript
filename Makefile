RAVEN = ./src/raven.js
BASE64 = ./src/vendor/base64.js
CRYPTO = ./src/vendor/crypto-sha1-hmac.min.js
VER = $(shell cat version.txt)
RAVEN_FULL = ./dist/raven-${VER}.js
RAVEN_MIN = ./dist/raven-${VER}.min.js
TMP = /tmp/raven.min.js

COMPRESSOR ?= `which yuicompressor`

#
# Build the compressed all-in-one file
#

raven:
	mkdir -p dist

	# Generate the full and compressed distributions
	cat ${BASE64} ${CRYPTO} ${RAVEN} | \
		sed "s/@VERSION/${VER}/" > ${RAVEN_FULL}

	cat ${RAVEN_FULL} | ${COMPRESSOR} --type js > ${RAVEN_MIN}

	# Prepend the tiny header to the compressed file
	echo "/* Raven.js v${VER} | https://github.com/lincolnloop/raven-js/ */" | \
		cat - ${RAVEN_MIN} > ${TMP}
	mv ${TMP} ${RAVEN_MIN}
