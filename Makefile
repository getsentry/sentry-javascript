RAVEN = ./src/raven.js
BASE64 = ./src/vendor/base64_encode.js
CRYPTO = ./src/vendor/crypto-sha1-hmac.min.js
VER = $(shell cat version.txt)
RAVEN_MIN = ./dist/raven-${VER}.min.js
TMP = /tmp/raven.js

COMPRESSOR ?= `which yuicompressor`

#
# Build the compressed all-in-one file
#

raven:
	mkdir -p dist

	# Generate the compressed file
	cat ${RAVEN} ${BASE64} ${CRYPTO} | \
		sed "s/@VERSION/${VER}/" | \
		${COMPRESSOR} --type js > ${RAVEN_MIN}

	# Prepend the tiny header to the compressed file
	echo "/* Raven.js v${VER} | https://github.com/lincolnloop/raven-js/ */" | \
		cat - ${RAVEN_MIN} > ${TMP}
	mv ${TMP} ${RAVEN_MIN}
