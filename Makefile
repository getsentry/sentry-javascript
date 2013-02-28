RAVEN = ./src/raven.js
VERSION ?= $(shell cat version.txt)
RAVEN_FULL = ./build/raven.js
RAVEN_MIN = ./build/raven.min.js
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
	mkdir -p build

	# Generate the full and compressed distributions
	cat ./template/_copyright.js ${DEPENDENCIES} ./template/_header.js ${RAVEN} ./template/_footer.js | \
		sed "s/@VERSION/${VERSION}/" >> ${RAVEN_FULL}

	cd build && ../node_modules/.bin/uglifyjs --source-map=raven.min.map --comments=/^!/ -m -c -o raven.min.js raven.js

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

PORT = 8888
runserver:
	python -m SimpleHTTPServer ${PORT}

clean:
	rm -rf build
	rm -rf docs/html

install-hooks:
	cp -rfp hooks/* .git/hooks

.PHONY: develop update-submodules docs docs-live raven test test-in-the-cloud clean runserver install-hooks
