.PHONY: run browser node node-core e2e

# Fuzzy-pick which test suite to run, then fuzzy-pick a test within it
run:
	@if ! command -v fzf > /dev/null 2>&1; then \
		echo "Error: fzf is required. Install with: brew install fzf"; \
		exit 1; \
	fi
	@suite=$$(printf '%s\n' browser-integration-tests node-integration-tests node-core-integration-tests e2e-tests | \
		fzf --height=10 --layout=reverse --border=rounded --margin=1.5% \
--color=dark --prompt="run test suite: "); \
	[ -n "$$suite" ] && $(MAKE) -C $$suite run

# Run directly in a specific suite
browser:
	@$(MAKE) -C browser-integration-tests run

node:
	@$(MAKE) -C node-integration-tests run

node-core:
	@$(MAKE) -C node-core-integration-tests run

e2e:
	@$(MAKE) -C e2e-tests run
