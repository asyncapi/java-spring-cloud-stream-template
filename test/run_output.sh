#!/bin/bash

# Script to run Spring Boot Maven projects in output directory
# Usage: ./run_output.sh [-d project-name] [-default] [-t timeout] [-h|--help]
#   -default: Run all Maven projects in output directory (sequentially)
#   -d project-name: Run only that specific project
#   -t timeout: Timeout in seconds for each application (default: 30)
#   -h, --help: Show this help message
#   If no options are provided, shows this help message

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"
DEFAULT_TIMEOUT=30

# Function to show help
show_help() {
    echo "Usage: $0 [-d project-name] [-default] [-t timeout] [-h|--help]"
    echo ""
    echo "Options:"
    echo "  -default         Run all Spring Boot projects in output directory"
    echo "  -d project-name  Run only that specific Spring Boot project"
    echo "  -t timeout       Timeout in seconds for each application (default: $DEFAULT_TIMEOUT)"
    echo "  -h, --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -default           # Run all Spring Boot projects with default timeout"
    echo "  $0 -default -t 60     # Run all projects with 60 second timeout"
    echo "  $0 -d animals         # Run only the 'animals' project"
    echo "  $0 -d animals -t 45   # Run 'animals' project with 45 second timeout"
    echo "  $0 --help             # Show this help message"
    echo ""
    echo "Default Directories:"
    echo "  Output Directory: $OUTPUT_DIR"
    echo "  Script Location: $SCRIPT_DIR"
    echo ""
    echo "Note: Applications are started with 'mvn spring-boot:run' and will run"
    echo "      until the timeout is reached. The script checks if the application"
    echo "      starts successfully by monitoring the log output."
    echo ""
}

# Parse command line arguments
SPECIFIED_PROJECT=""
DEFAULT_MODE=false
TIMEOUT=$DEFAULT_TIMEOUT

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
        -t)
            if [[ -n "$2" && "$2" != -* ]]; then
                TIMEOUT="$2"
                shift 2
            else
                echo "Error: -t requires a timeout value in seconds"
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
    echo "No options specified. Use -default to run all projects or -d to specify a project."
    echo ""
    show_help
    exit 0
fi

# Check if output directory exists
if [ ! -d "$OUTPUT_DIR" ]; then
    echo "Error: Output directory '$OUTPUT_DIR' does not exist!"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to check if a Spring Boot application started successfully
check_spring_boot_started() {
    local log_file="$1"
    local timeout="$2"
    local start_time=$(date +%s)

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [ $elapsed -ge $timeout ]; then
            return 2  # Timeout
        fi

        if [ -f "$log_file" ]; then
            # Check for successful startup indicators
            if grep -q "Started.*Application" "$log_file" 2>/dev/null || \
               grep -q "Started.*in.*seconds" "$log_file" 2>/dev/null || \
               grep -q "Tomcat started on port" "$log_file" 2>/dev/null || \
               grep -q "Netty started on port" "$log_file" 2>/dev/null; then
                return 0  # Success
            fi

            # Check for failure indicators
            if grep -q "APPLICATION FAILED TO START" "$log_file" 2>/dev/null || \
               grep -q "Error starting ApplicationContext" "$log_file" 2>/dev/null || \
               grep -q "Application run failed" "$log_file" 2>/dev/null || \
               grep -q "BUILD FAILURE" "$log_file" 2>/dev/null; then
                return 1  # Failed
            fi
        fi

        sleep 1
    done
}

# Function to run a single Spring Boot project
run_spring_boot_project() {
    local project_path="$1"
    local project_name="$2"
    local timeout="$3"
    local log_file="/tmp/spring-boot-run-${project_name}-$$.log"

    echo -e "${GREEN}Running Spring Boot project: '$project_name'...${NC}"
    echo -e "${YELLOW}Executing: mvn spring-boot:run in '$project_path'${NC}"
    echo -e "${CYAN}Timeout: ${timeout}s${NC}"

    # Record start time
    local start_time=$(date +%s)

    # Start the Spring Boot application in background
    cd "$project_path"
    mvn spring-boot:run > "$log_file" 2>&1 &
    local mvn_pid=$!
    cd - > /dev/null

    # Wait for startup or timeout
    check_spring_boot_started "$log_file" "$timeout"
    local result=$?

    # Calculate execution time
    local end_time=$(date +%s)
    local execution_time=$((end_time - start_time))

    # Kill the Spring Boot process
    if kill -0 $mvn_pid 2>/dev/null; then
        kill $mvn_pid 2>/dev/null
        # Wait a moment and force kill if needed
        sleep 2
        if kill -0 $mvn_pid 2>/dev/null; then
            kill -9 $mvn_pid 2>/dev/null
        fi
    fi

    # Report results
    case $result in
        0)
            echo -e "${GREEN}✓ Application started successfully for '$project_name' (${execution_time}s)${NC}"
            # Show startup message
            if [ -f "$log_file" ]; then
                echo -e "${CYAN}Startup log (last 5 lines):${NC}"
                tail -5 "$log_file" | head -5
            fi
            rm -f "$log_file"
            return 0
            ;;
        1)
            echo -e "${RED}✗ Application failed to start for '$project_name' (${execution_time}s)${NC}"
            echo -e "${RED}Error details:${NC}"
            if [ -f "$log_file" ]; then
                # Show error details
                grep -A 5 "APPLICATION FAILED TO START\|Error starting ApplicationContext\|Application run failed\|BUILD FAILURE" "$log_file" | head -20
                echo ""
                echo -e "${YELLOW}Full log saved at: $log_file${NC}"
            fi
            return 1
            ;;
        2)
            echo -e "${YELLOW}⏱ Timeout reached for '$project_name' (${execution_time}s)${NC}"
            echo -e "${YELLOW}Application may still be starting or running. Check log for details.${NC}"
            if [ -f "$log_file" ]; then
                echo -e "${CYAN}Last 10 lines of log:${NC}"
                tail -10 "$log_file"
            fi
            rm -f "$log_file"
            return 2
            ;;
    esac
}

# Resolve SPECIFIED_PROJECT to absolute path BEFORE changing directory
if [ -n "$SPECIFIED_PROJECT" ]; then
    # Check if it's a path (contains /) or just a project name
    if [[ "$SPECIFIED_PROJECT" == */* ]]; then
        # It's a path - check if it exists from current directory
        if [ ! -d "$SPECIFIED_PROJECT" ]; then
            echo -e "${RED}Error: Project directory '$SPECIFIED_PROJECT' not found!${NC}"
            exit 1
        fi
        # Convert to absolute path if it's a relative path
        if [[ "$SPECIFIED_PROJECT" != /* ]]; then
            SPECIFIED_PROJECT="$(cd "$SPECIFIED_PROJECT" && pwd)"
        fi
    else
        # It's just a project name - check in OUTPUT_DIR
        if [ ! -d "$OUTPUT_DIR/$SPECIFIED_PROJECT" ]; then
            echo -e "${RED}Error: Project directory '$SPECIFIED_PROJECT' not found in output directory!${NC}"
            echo -e "${YELLOW}Available projects in $OUTPUT_DIR:${NC}"
            cd "$OUTPUT_DIR"
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
        # Convert to absolute path
        SPECIFIED_PROJECT="$OUTPUT_DIR/$SPECIFIED_PROJECT"
    fi

    if [ ! -f "$SPECIFIED_PROJECT/pom.xml" ]; then
        echo -e "${RED}Error: Project '$SPECIFIED_PROJECT' does not contain a pom.xml file!${NC}"
        exit 1
    fi
fi

cd "$OUTPUT_DIR"

if [ -n "$SPECIFIED_PROJECT" ]; then

    echo -e "${BLUE}=== Spring Boot Run Script ===${NC}"
    echo -e "${BLUE}Running specific project: $SPECIFIED_PROJECT${NC}"
    echo -e "${BLUE}Timeout: ${TIMEOUT}s${NC}"
    echo ""

    # Process only the specified project
    maven_projects=("$SPECIFIED_PROJECT")
    non_maven_folders=()
elif [ "$DEFAULT_MODE" = true ]; then
    echo -e "${BLUE}=== Spring Boot Run Script ===${NC}"
    echo -e "${BLUE}Running all Spring Boot projects in output directory${NC}"
    echo -e "${BLUE}Timeout per project: ${TIMEOUT}s${NC}"
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

echo -e "${YELLOW}Spring Boot projects to run (${#maven_projects[@]}):${NC}"
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

# Run each Spring Boot project
runs_attempted=0
runs_successful=0
runs_failed=0
runs_timeout=0
failed_projects=()
timeout_projects=()

for project in "${maven_projects[@]}"; do
    # Get project name (handle both full path and relative)
    if [[ "$project" == /* ]]; then
        project_name=$(basename "$project")
        project_path="$project"
    else
        project_name="$project"
        project_path="$OUTPUT_DIR/$project"
    fi

    run_spring_boot_project "$project_path" "$project_name" "$TIMEOUT"
    run_result=$?

    case $run_result in
        0)
            ((runs_successful++))
            ;;
        1)
            failed_projects+=("$project_name")
            ((runs_failed++))
            ;;
        2)
            timeout_projects+=("$project_name")
            ((runs_timeout++))
            ;;
    esac

    echo "----------------------------------------"
    ((runs_attempted++))
done

# Summary
echo ""
echo -e "${BLUE}=== Run Summary ===${NC}"
if [ "$DEFAULT_MODE" = true ]; then
    echo -e "Total folders found: $((${#maven_projects[@]} + ${#non_maven_folders[@]}))"
    echo -e "Maven projects found: ${#maven_projects[@]}"
    echo -e "Non-Maven folders: ${#non_maven_folders[@]}"
else
    echo -e "Project run: $(basename "$SPECIFIED_PROJECT")"
fi
echo -e "Runs attempted: $runs_attempted"
echo -e "Successful starts: ${GREEN}$runs_successful${NC}"
echo -e "Failed starts: ${RED}$runs_failed${NC}"
echo -e "Timeouts: ${YELLOW}$runs_timeout${NC}"

if [ $runs_failed -eq 0 ] && [ $runs_timeout -eq 0 ] && [ $runs_attempted -gt 0 ]; then
    echo -e "${GREEN}All Spring Boot applications started successfully! ✓${NC}"
elif [ $runs_failed -gt 0 ]; then
    echo -e "${RED}Failed projects:${NC}"
    printf '%s\n' "${failed_projects[@]}"
fi

if [ $runs_timeout -gt 0 ]; then
    echo -e "${YELLOW}Timeout projects (may have started slowly):${NC}"
    printf '%s\n' "${timeout_projects[@]}"
fi

echo ""

# Optional: Create a detailed report (only for batch processing)
if [ "$DEFAULT_MODE" = true ]; then
    read -p "Generate detailed run report to file? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        report_file="$SCRIPT_DIR/run_report_$(date +%Y%m%d_%H%M%S).txt"
        echo "Generating detailed report: $report_file"

        {
            echo "=== SPRING BOOT RUN REPORT ==="
            echo "Generated: $(date)"
            echo "Directory: $OUTPUT_DIR"
            echo "Timeout per project: ${TIMEOUT}s"
            echo ""
            echo "=== SUMMARY ==="
            echo "Total folders found: $((${#maven_projects[@]} + ${#non_maven_folders[@]}))"
            echo "Maven projects found: ${#maven_projects[@]}"
            echo "Non-Maven folders: ${#non_maven_folders[@]}"
            echo "Runs attempted: $runs_attempted"
            echo "Successful starts: $runs_successful"
            echo "Failed starts: $runs_failed"
            echo "Timeouts: $runs_timeout"
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
                printf '%s\n' "${failed_projects[@]}"
                echo ""
            fi

            if [ ${#timeout_projects[@]} -gt 0 ]; then
                echo "=== TIMEOUT PROJECTS ==="
                printf '%s\n' "${timeout_projects[@]}"
                echo ""
            fi

        } > "$report_file"

        echo -e "${GREEN}Report saved to: $report_file${NC}"
    fi
fi

# Exit with appropriate code
if [ $runs_failed -gt 0 ]; then
    exit 1
else
    exit 0
fi
