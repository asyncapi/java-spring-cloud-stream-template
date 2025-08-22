#!/bin/bash

# Script to compile Maven projects in output directory
# Usage: ./compile_output.sh [-d project-name] [-default] [-h|--help]
#   -default: Compile all Maven projects in output directory
#   -d project-name: Compile only that specific project
#   -h, --help: Show this help message
#   If no options are provided, shows this help message

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"

# Function to show help
show_help() {
    echo "Usage: $0 [-d project-name] [-default] [-h|--help]"
    echo ""
    echo "Options:"
    echo "  -default         Compile all Maven projects in output directory"
    echo "  -d project-name  Compile only that specific Maven project"
    echo "  -h, --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -default      # Compile all Maven projects in output directory"
    echo "  $0 -d animals    # Compile only the 'animals' project"
    echo "  $0 --help        # Show this help message"
    echo ""
    echo "Default Directories:"
    echo "  Output Directory: $OUTPUT_DIR"
    echo "  Script Location: $SCRIPT_DIR"
    echo ""
}

# Parse command line arguments
SPECIFIED_PROJECT=""
DEFAULT_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -d)
            if [[ -n "$2" && "$2" != -* ]]; then
                SPECIFIED_PROJECT="$2"
                shift 2
            else
                echo "Error: -d requires a project name argument"
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
if [ -z "$SPECIFIED_PROJECT" ] && [ "$DEFAULT_MODE" = false ]; then
    echo "No options specified. Use -default to compile all projects or -d to specify a project."
    echo ""
    show_help
    exit 0
fi

# Check if output directory exists
if [ ! -d "$OUTPUT_DIR" ]; then
    echo "Error: Output directory '$OUTPUT_DIR' does not exist!"
    exit 1
fi

cd "$OUTPUT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ -n "$SPECIFIED_PROJECT" ]; then
    # Check if the specified project exists and has pom.xml
    if [ ! -d "$SPECIFIED_PROJECT" ]; then
        echo -e "${RED}Error: Project directory '$SPECIFIED_PROJECT' not found in output directory!${NC}"
        echo -e "${YELLOW}Available projects in $OUTPUT_DIR:${NC}"
        for folder in */; do
            folder_name="${folder%/}"
            if [ -f "$folder_name/pom.xml" ]; then
                echo "  - $folder_name (Maven project)"
            else
                echo "  - $folder_name (non-Maven folder)"
            fi
        done
        exit 1
    fi
    
    if [ ! -f "$SPECIFIED_PROJECT/pom.xml" ]; then
        echo -e "${RED}Error: Project '$SPECIFIED_PROJECT' does not contain a pom.xml file!${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}=== Maven Compilation Script ===${NC}"
    echo -e "${BLUE}Compiling specific project: $SPECIFIED_PROJECT${NC}"
    echo ""
    
    # Process only the specified project
    maven_projects=("$SPECIFIED_PROJECT")
    non_maven_folders=()
elif [ "$DEFAULT_MODE" = true ]; then
    echo -e "${BLUE}=== Maven Compilation Script ===${NC}"
    echo -e "${BLUE}Compiling all Maven projects in output directory${NC}"
    echo ""
    
    # Find all directories with pom.xml files
    maven_projects=()
    non_maven_folders=()
    
    for folder in */; do
        # Remove trailing slash
        folder_name="${folder%/}"
        
        # Skip the verified directory
        if [[ "$folder_name" == "verified" ]]; then
            continue
        fi
        
        # Check if folder contains pom.xml
        if [ -f "$folder_name/pom.xml" ]; then
            maven_projects+=("$folder_name")
        else
            non_maven_folders+=("$folder_name")
        fi
    done
else
    echo "Error: No valid operation specified"
    exit 1
fi

echo -e "${YELLOW}Maven projects to compile (${#maven_projects[@]}):${NC}"
if [ ${#maven_projects[@]} -gt 0 ]; then
    printf '%s\n' "${maven_projects[@]}"
else
    echo "None"
fi
echo ""

if [ "$DEFAULT_MODE" = true ] && [ ${#non_maven_folders[@]} -gt 0 ]; then
    echo -e "${YELLOW}Non-Maven folders (${#non_maven_folders[@]}):${NC}"
    printf '%s\n' "${non_maven_folders[@]}"
    echo ""
fi

# Compile each Maven project
compilations_attempted=0
compilations_successful=0
compilations_failed=0
failed_projects=()

for project in "${maven_projects[@]}"; do
    echo -e "${GREEN}Compiling Maven project: '$project'...${NC}"
    echo -e "${YELLOW}Executing: mvn compile in '$project'${NC}"
    
    # Record start time
    start_time=$(date +%s)
    
    # Perform Maven compilation
    cd "$project"
    mvn_output=$(mvn compile 2>&1)
    mvn_status=$?
    cd ..
    
    # Calculate execution time
    end_time=$(date +%s)
    execution_time=$((end_time - start_time))
    
    if [ $mvn_status -eq 0 ]; then
        echo -e "${GREEN}✓ Compilation successful for '$project' (${execution_time}s)${NC}"
        ((compilations_successful++))
    else
        echo -e "${RED}✗ Compilation failed for '$project' (${execution_time}s)${NC}"
        echo -e "${RED}Error details:${NC}"
        echo "$mvn_output" | tail -20  # Show last 20 lines of error
        failed_projects+=("$project")
        ((compilations_failed++))
    fi
    
    echo "----------------------------------------"
    ((compilations_attempted++))
done

# Summary
echo ""
echo -e "${BLUE}=== Compilation Summary ===${NC}"
if [ "$DEFAULT_MODE" = true ]; then
    echo -e "Total folders found: $((${#maven_projects[@]} + ${#non_maven_folders[@]}))"
    echo -e "Maven projects found: ${#maven_projects[@]}"
    echo -e "Non-Maven folders: ${#non_maven_folders[@]}"
else
    echo -e "Project compiled: $SPECIFIED_PROJECT"
fi
echo -e "Compilations attempted: $compilations_attempted"
echo -e "Successful compilations: $compilations_successful"
echo -e "Failed compilations: $compilations_failed"

if [ $compilations_failed -eq 0 ] && [ $compilations_attempted -gt 0 ]; then
    echo -e "${GREEN}All Maven projects compiled successfully! ✓${NC}"
elif [ $compilations_failed -gt 0 ]; then
    echo -e "${RED}Failed projects:${NC}"
    printf '%s\n' "${failed_projects[@]}"
fi

echo ""

# Optional: Create a detailed report (only for batch processing)
if [ "$DEFAULT_MODE" = true ]; then
    read -p "Generate detailed compilation report to file? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        report_file="$SCRIPT_DIR/compilation_report_$(date +%Y%m%d_%H%M%S).txt"
        echo "Generating detailed report: $report_file"
        
        {
            echo "=== MAVEN COMPILATION REPORT ==="
            echo "Generated: $(date)"
            echo "Directory: $OUTPUT_DIR"
            echo ""
            echo "=== SUMMARY ==="
            echo "Total folders found: $((${#maven_projects[@]} + ${#non_maven_folders[@]}))"
            echo "Maven projects found: ${#maven_projects[@]}"
            echo "Non-Maven folders: ${#non_maven_folders[@]}"
            echo "Compilations attempted: $compilations_attempted"
            echo "Successful compilations: $compilations_successful"
            echo "Failed compilations: $compilations_failed"
            echo ""
            
            if [ ${#maven_projects[@]} -gt 0 ]; then
                echo "=== MAVEN PROJECTS ==="
                printf '%s\n' "${maven_projects[@]}"
                echo ""
            fi
            
            if [ ${#non_maven_folders[@]} -gt 0 ]; then
                echo "=== NON-MAVEN FOLDERS ==="
                printf '%s\n' "${non_maven_folders[@]}"
                echo ""
            fi
            
            if [ ${#failed_projects[@]} -gt 0 ]; then
                echo "=== FAILED PROJECTS ==="
                for project in "${failed_projects[@]}"; do
                    echo "=== Compilation output for '$project' ==="
                    cd "$project"
                    mvn compile 2>&1
                    cd ..
                    echo ""
                done
            fi
            
        } > "$report_file"
        
        echo -e "${GREEN}Report saved to: $report_file${NC}"
    fi
fi

# Exit with appropriate code
if [ $compilations_failed -gt 0 ]; then
    exit 1
else
    exit 0
fi