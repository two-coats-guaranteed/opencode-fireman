#!/usr/bin/env bash
# Consumer install test.
#
# Packs the local project into a tarball, installs that tarball into a
# fresh throwaway project, and verifies that:
#
#   - `import { Fireman } from "opencode-fireman"`           resolves
#   - `import { analyze } from "opencode-fireman/detector"`  resolves
#   - both exports are functions
#   - the analyze() export works on a real trap file copied from the bench
#
# Catches issues like wrong `exports` map, missing files in `files`, ESM
# resolution failures, or dist/ shape mismatches that pure-internal tests
# miss.
#
# Run from the repo root:  bash scripts/consumer-test.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Pack (skip rebuild if dist/ is fresh; CI always rebuilds anyway)
if [ ! -f dist/index.js ]; then
  echo "consumer-test: dist/ missing, running build first"
  bun run build
fi

rm -f opencode-fireman-*.tgz
bun pm pack >/dev/null
TARBALL="$(ls opencode-fireman-*.tgz | head -1)"
TARBALL_ABS="$REPO_ROOT/$TARBALL"
echo "consumer-test: packed $TARBALL"

# 2. Fresh consumer project
CONSUMER="$(mktemp -d)"
trap 'rm -rf "$CONSUMER"' EXIT
echo "consumer-test: consumer project at $CONSUMER"

cd "$CONSUMER"
cat > package.json <<'EOF'
{
  "name": "fireman-consumer-test",
  "version": "0.0.0",
  "type": "module",
  "private": true
}
EOF

# 3. Install the tarball (peer dep @opencode-ai/plugin is type-only at runtime)
bun add "file:$TARBALL_ABS" >/dev/null 2>&1

# 4. Copy the trap file we want to analyze (consumer doesn't ship with bench/)
TRAP_SRC="$REPO_ROOT/bench/traps/T001-serializer-key-ordering"
mkdir -p trap
cp "$TRAP_SRC"/*.ts trap/

# 5. Write the consumer test
cat > test.mjs <<'EOF'
import { Fireman } from "opencode-fireman";
import { analyze } from "opencode-fireman/detector";
import { join } from "node:path";

function fail(msg) {
  console.error(`consumer-test: ${msg}`);
  process.exit(1);
}

if (typeof Fireman !== "function") {
  fail(`Fireman export is not a function (got ${typeof Fireman})`);
}
if (typeof analyze !== "function") {
  fail(`analyze export is not a function (got ${typeof analyze})`);
}

const findings = analyze(join(process.cwd(), "trap", "audit-serializer.ts"));
if (findings.length !== 1) {
  fail(`expected 1 finding from packaged detector, got ${findings.length}`);
}
if (findings[0].category !== "sibling-divergence") {
  fail(`wrong category: ${findings[0].category}`);
}

console.log("consumer-test: OK");
console.log(`  Fireman: ${typeof Fireman}`);
console.log(`  analyze: ${typeof analyze}`);
console.log(`  finding: ${findings[0].category} @ lines ${findings[0].start_line}-${findings[0].end_line}`);
EOF

# 6. Run it under both Bun (primary) and Node (sanity check)
echo "consumer-test: running under bun"
bun test.mjs
echo "consumer-test: running under node"
node test.mjs

echo "consumer-test: PASSED"
