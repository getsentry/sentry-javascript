#!/bin/bash

# Check if the correct number of arguments is provided
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <output_file>"
    exit 1
fi


# Get the directory of the script
script_dir=$(cd "$(dirname "$0")" && pwd)

folder_path="$script_dir/.."

output_file=$1

# Find all .tgz files in the specified folder
find "$folder_path" -type f -name "*.tgz" | sort | while read -r tgz_file; do
    echo "Processing $tgz_file..."

    # Extract the contents of the .tgz file to a temporary directory
    temp_dir=$(mktemp -d)
    tar -xzf "$tgz_file" -C "$temp_dir"

    # Get the filename of the .tgz file
    tgz_filename=$(basename "$tgz_file")

    # Find and print all file paths prefixed with the filename
    find "$temp_dir" -type f -printf "%P\t$tgz_filename\n" >> "$output_file"

    # Clean up the temporary directory
    rm -r "$temp_dir"

    echo "Done processing $tgz_file."
done

echo "Script completed. Results are stored in $output_file."
