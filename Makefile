RAVEN = ./src/raven.js
VERSION ?= $(shell cat version.txt)
RAVEN_FULL = ./build/raven.js
RAVEN_MIN = ./build/raven.min.js
BRANCH = $(shell git rev-parse --short --abbrev-ref HEAD)
TMP = /tmp/raven.min.js

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

clean:
	rm -rf build
	rm -rf docs/html

install-hooks:
	cp -rfp hooks/* .git/hooks

.PHONY: develop update-submodules docs docs-live raven test clean runserver install-hooks
