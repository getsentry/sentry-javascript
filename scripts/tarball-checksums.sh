#!/bin/sh

# Get the directory of the script
script_dir=$(cd "$(dirname "$0")" && pwd)

# Function to calculate SHA checksums for files
calculate_sha_checksum() {
    file="$1"
    sha_checksum=$(sha256sum "$file" | awk '{print $1}')
    echo "$file: $sha_checksum"
}

# Main function to process files recursively
process_files() {
    # Find all ".tgz" files recursively
    find "$script_dir/.." -type f -name "*.tgz" | while IFS= read -r file; do
        calculate_sha_checksum "$file"
    done
}

# Call the main function to process files
process_files
