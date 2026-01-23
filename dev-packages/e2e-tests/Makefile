.PHONY: run list

run:
	@if ! command -v fzf &> /dev/null; then \
		echo "Error: fzf is required. Install with: brew install fzf"; \
		exit 1; \
	fi
	@ls test-applications | fzf --height=10 --layout=reverse --border=rounded --margin=1.5% --color=dark --prompt="yarn test:run " | xargs -r yarn test:run

list:
	@ls test-applications
