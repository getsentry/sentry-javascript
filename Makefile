test:
	@NODE_ENV=test \
		./node_modules/.bin/mocha --reporter dot

.PHONY: test