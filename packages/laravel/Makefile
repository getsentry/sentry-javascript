.PHONY: develop
develop: vendor update-submodules setup-git

vendor: composer.lock
	composer install

composer.lock: composer.json
	composer update

.PHONY: update-submodules
update-submodules:
	git submodule init
	git submodule update

.PHONY: setup-git
setup-git:
	git config branch.autosetuprebase always

.PHONY: phpcs
phpcs:
	composer phpcs

.PHONY: phpstan
phpstan:
	composer phpstan

.PHONY: tests
tests:
	composer tests
