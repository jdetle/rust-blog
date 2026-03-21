#!/usr/bin/env bash
set -euo pipefail

# Core-aware parallel test runner with deadlock prevention.
#
# Linux (CI):  splits test files round-robin across N processes (one per core),
#              each wrapped in `timeout` to prevent hangs.
# macOS (local): batches files in groups of 5 to avoid the Bun v1.3.x deadlock
#                that triggers with >= 7 test files in a single invocation.

CORES=$(nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || echo 2)
IS_CI="${CI:-false}"
PROCESS_TIMEOUT=60

TEST_FILES=()
while IFS= read -r f; do
  TEST_FILES+=("$f")
done < <(find lib -name '*.test.ts' -type f | sort)
FILE_COUNT=${#TEST_FILES[@]}

if [ "$FILE_COUNT" -eq 0 ]; then
  echo "No test files found."
  exit 0
fi

BAIL_FLAG=""
if [ "$IS_CI" != "false" ]; then
  BAIL_FLAG="--bail=1"
fi

HAS_TIMEOUT=false
command -v timeout &>/dev/null && HAS_TIMEOUT=true

if $HAS_TIMEOUT && [ "$FILE_COUNT" -gt 1 ] && [ "$CORES" -gt 1 ]; then
  # Linux / CI: split files round-robin across available cores
  EFFECTIVE_CORES=$((CORES < FILE_COUNT ? CORES : FILE_COUNT))
  echo "Running $FILE_COUNT test files across $EFFECTIVE_CORES parallel processes (timeout ${PROCESS_TIMEOUT}s each)"

  PIDS=()
  for ((i = 0; i < EFFECTIVE_CORES; i++)); do
    batch=()
    for ((j = i; j < FILE_COUNT; j += EFFECTIVE_CORES)); do
      batch+=("${TEST_FILES[$j]}")
    done
    timeout "$PROCESS_TIMEOUT" bun test $BAIL_FLAG "${batch[@]}" &
    PIDS+=($!)
  done

  FAIL=0
  for pid in "${PIDS[@]}"; do
    wait "$pid" || FAIL=1
  done
  exit $FAIL
else
  # macOS or single-core: batch in groups of 5 to avoid deadlock
  BATCH_SIZE=5
  echo "Running $FILE_COUNT test files in batches of $BATCH_SIZE"

  for ((i = 0; i < FILE_COUNT; i += BATCH_SIZE)); do
    batch=("${TEST_FILES[@]:i:BATCH_SIZE}")
    bun test $BAIL_FLAG "${batch[@]}"
  done
fi
