.PHONY: run list

run:
	@if ! command -v fzf > /dev/null 2>&1; then \
		echo "Error: fzf is required. Install with: brew install fzf"; \
		exit 1; \
	fi
	@ls test-applications | fzf --height=10 --layout=reverse --border=rounded --margin=1.5% --color=dark --prompt="pnpm run test:run " | xargs pnpm run test:run

list:
	@ls test-applications
