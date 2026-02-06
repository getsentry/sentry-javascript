.PHONY: run

run:
	@if ! command -v fzf > /dev/null 2>&1; then \
		echo "Error: fzf is required. Install with: brew install fzf"; \
		exit 1; \
	fi
	@find . -name test.ts | sed -e 's|^\./suites/||' -e 's|/test\.ts$$||' | fzf --height=10 --layout=reverse --border=rounded --margin=1.5% --color=dark --prompt="yarn test " | xargs -r yarn test

