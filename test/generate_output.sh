#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOCKS_DIR="$SCRIPT_DIR/mocks"
DEFAULT_OUTPUT_DIR="$SCRIPT_DIR/output"
TEST_JS="$SCRIPT_DIR/generate_code_for_mocks.js"

# Script to generate code for AsyncAPI files
# Usage: ./generate_output.sh [-f filename] [-o output-dir] [-default] [-h|--help]
#   -default: Generate code for all files in mocks directory
#   -f filename: Generate code for a specific file (can include full path)
#   -o output-dir: Specify output directory for generated code (default: test/output)
#   -h, --help: Show this help message
#   If no options are provided, shows this help message

# Function to show help
show_help() {
    echo "Usage: $0 [-f filename] [-o output-dir] [-default] [-h|--help]"
    echo ""
    echo "Options:"
    echo "  -default       Generate code for all files in mocks directory"
    echo "  -f filename    Generate code for a specific AsyncAPI file (can include full path)"
    echo "  -o output-dir  Specify output directory for generated code (default: test/output)"
    echo "  -h, --help     Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -default                    # Generate code for all files in mocks directory"
    echo "  $0 -f /temp/animals.yaml       # Generate code for animals.yaml"
    echo "  $0 -f file.yaml -o /output     # Generate specific file to custom output"
    echo "  $0 -default -o /custom/output  # Generate all files to custom output"
    echo "  $0 --help                      # Show this help message"
    echo ""
    echo "Default Directories:"
    echo "  Mocks Directory: $MOCKS_DIR"
    echo "  Default Output:  $DEFAULT_OUTPUT_DIR"
    echo "  Test Script:     $TEST_JS"
    echo ""
}

# Parse command line arguments
SPECIFIED_FILE=""
OUTPUT_DIR="$DEFAULT_OUTPUT_DIR"
DEFAULT_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -f)
            if [[ -n "$2" && "$2" != -* ]]; then
                SPECIFIED_FILE="$2"
                shift 2
            else
                echo "Error: -f requires a filename argument"
                exit 1
            fi
            ;;
        -o)
            if [[ -n "$2" && "$2" != -* ]]; then
                OUTPUT_DIR="$2"
                shift 2
            else
                echo "Error: -o requires an output directory argument"
                exit 1
            fi
            ;;
        -default)
            DEFAULT_MODE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Error: Unknown option $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# If no options provided, show help
if [ -z "$SPECIFIED_FILE" ] && [ "$DEFAULT_MODE" = false ]; then
    echo "No options specified. Use -default to process all files or -f to specify a file."
    echo ""
    show_help
    exit 0
fi

# Check if mocks directory exists (only needed for batch processing)
if [ ! -d "$MOCKS_DIR" ]; then
    echo "Error: Mocks directory '$MOCKS_DIR' does not exist!"
    exit 1
fi

# Check if code generation script exists
if [ ! -f "$TEST_JS" ]; then
    echo "Error: '$TEST_JS' does not exist!"
    exit 1
fi

# Create output directory if it doesn't exist
if [ ! -d "$OUTPUT_DIR" ]; then
    echo "Creating output directory: $OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Resolve SPECIFIED_FILE to absolute path BEFORE changing directory
if [ -n "$SPECIFIED_FILE" ]; then
    # Check if the specified file exists (relative to current working directory)
    if [ ! -f "$SPECIFIED_FILE" ]; then
        echo -e "${RED}Error: File '$SPECIFIED_FILE' not found!${NC}"
        exit 1
    fi
    # Convert to absolute path if it's a relative path
    if [[ "$SPECIFIED_FILE" != /* ]]; then
        SPECIFIED_FILE="$(cd "$(dirname "$SPECIFIED_FILE")" && pwd)/$(basename "$SPECIFIED_FILE")"
    fi
fi

cd "$SCRIPT_DIR"

if [ -n "$SPECIFIED_FILE" ]; then
    
    # Get just the filename for processing (without path)
    FILENAME=$(basename "$SPECIFIED_FILE")
    
    echo -e "${BLUE}=== Code Generation Script ===${NC}"
    echo -e "${BLUE}Generating code for specific file: $SPECIFIED_FILE${NC}"
    echo -e "${BLUE}Output directory: $OUTPUT_DIR${NC}"
    echo ""
    
    # Process only the specified file
    mock_files=("$FILENAME")
    
    # Create a temporary copy in mocks directory for processing
    TEMP_COPY="$MOCKS_DIR/$FILENAME"
    cp "$SPECIFIED_FILE" "$TEMP_COPY"
    echo -e "${YELLOW}Copied file to temporary location: $TEMP_COPY${NC}"
    echo ""
elif [ "$DEFAULT_MODE" = true ]; then
    echo -e "${BLUE}=== Code Generation Script ===${NC}"
    echo -e "${BLUE}Generating code for all files in mocks directory${NC}"
    echo -e "${BLUE}Output directory: $OUTPUT_DIR${NC}"
    echo ""
    
    # Find all files in mocks directory
    mock_files=()
    
    cd "$MOCKS_DIR"
    for file in *; do
        # Skip directories and hidden files
        if [ -f "$file" ] && [[ ! "$file" == .* ]]; then
            mock_files+=("$file")
        fi
    done
    
    cd "$SCRIPT_DIR"
else
    echo "Error: No valid operation specified"
    exit 1
fi

echo -e "${YELLOW}Files to process (${#mock_files[@]}):${NC}"
printf '%s\n' "${mock_files[@]}"
echo ""

# Process each mock file
generations_attempted=0
generations_successful=0
generations_failed=0
failed_files=()

echo -e "${BLUE}=== Generating Code ===${NC}"

for file in "${mock_files[@]}"; do
    echo -e "${GREEN}Processing mock file: '$file'...${NC}"
    echo -e "${YELLOW}Executing: node "$TEST_JS" "$file"${NC}"
    
    # Execute the code generation
    start_time=$(date +%s)
    output=$(OUTPUT_DIR="$OUTPUT_DIR" node "$TEST_JS" "$file" 2>&1)
    exit_status=$?
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    if [ $exit_status -eq 0 ]; then
        echo -e "${GREEN}✓ Successfully generated code for '$file' (${duration}s)${NC}"
        ((generations_successful++))
    else
        echo -e "${RED}✗ Failed to generate code for '$file' (${duration}s):${NC}"
        echo "$output"
        failed_files+=("$file")
        ((generations_failed++))
    fi
    
    echo "----------------------------------------"
    ((generations_attempted++))
done

# Clean up temporary copy if it was created
if [ -n "$SPECIFIED_FILE" ] && [ -f "$TEMP_COPY" ]; then
    rm "$TEMP_COPY"
    echo -e "${YELLOW}Cleaned up temporary file: $TEMP_COPY${NC}"
    echo ""
fi

# Summary
echo ""
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "Files processed: ${#mock_files[@]}"
echo -e "Generations attempted: $generations_attempted"
echo -e "Generations successful: $generations_successful"
echo -e "Generations failed: $generations_failed"
echo -e "Output directory: $OUTPUT_DIR"

if [ $generations_failed -eq 0 ]; then
    echo -e "${GREEN}All code generations completed successfully! ✓${NC}"
else
    echo -e "${RED}Failed to generate code for $generations_failed file(s) ✗${NC}"
    echo -e "${YELLOW}Failed files:${NC}"
    printf '%s\n' "${failed_files[@]}"
fi

echo ""

# Optional: Create a detailed report (only for batch processing)
if [ "$DEFAULT_MODE" = true ]; then
    read -p "Generate detailed generation report to file? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        report_file="$SCRIPT_DIR/generation_report_$(date +%Y%m%d_%H%M%S).txt"
        echo "Generating detailed report: $report_file"
        
        {
            echo "=== CODE GENERATION REPORT ==="
            echo "Generated: $(date)"
            echo "Mocks Directory: $MOCKS_DIR"
            echo "Output Directory: $OUTPUT_DIR"
            echo "Test Script: $TEST_JS"
            echo ""
            echo "Summary:"
            echo "  Files processed: ${#mock_files[@]}"
            echo "  Generations attempted: $generations_attempted"
            echo "  Generations successful: $generations_successful"
            echo "  Generations failed: $generations_failed"
            echo ""
            
            # List all mock files
            echo "=== FILES PROCESSED ==="
            for file in "${mock_files[@]}"; do
                echo "  - $file"
            done
            echo ""
            
            # Failed files details
            if [ $generations_failed -gt 0 ]; then
                echo "=== FAILED GENERATIONS ==="
                for file in "${failed_files[@]}"; do
                    echo "=== Failed: $file ==="
                    echo "Command: node $TEST_JS $file"
                    node "$TEST_JS" "$file" 2>&1 || true
                    echo ""
                done
            fi
            
            # List generated output directories
            echo "=== GENERATED OUTPUT DIRECTORIES ==="
            if [ -d "$OUTPUT_DIR" ]; then
                cd "$OUTPUT_DIR"
                for dir in */; do
                    if [ -d "$dir" ]; then
                        dir_name="${dir%/}"
                        echo "  - $dir_name"
                    fi
                done
            fi
            
        } > "$report_file"
        
        echo -e "${GREEN}Report saved to: $report_file${NC}"
    fi
fi

# Exit with appropriate code
if [ $generations_failed -gt 0 ]; then
    exit 1
else
    exit 0
fi
