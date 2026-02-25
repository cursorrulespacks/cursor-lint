# cursor-doctor

Diagnose, audit, and fix your Cursor AI rules setup.

Find broken YAML, token waste, conflicting rules, coverage gaps, and deprecated `.cursorrules` files in seconds.

## Install

```bash
npx cursor-doctor scan
```

Or install globally:

```bash
npm install -g cursor-doctor
```

## Free Commands

### `cursor-doctor scan`

Full health check of your `.cursor/` directory:

- Rule count and file sizes
- Token estimates per rule
- Broken YAML detection
- Deprecated `.cursorrules` warning
- Coverage gaps (file types without rules)
- Health score (A-F grade)

### `cursor-doctor check`

Same checks, one line per issue. Returns exit code 1 if problems found. Perfect for CI:

```bash
cursor-doctor check && echo "Rules are healthy"
```

### `cursor-doctor migrate`

Convert legacy `.cursorrules` to `.cursor/rules/*.mdc` format.

## Pro Commands

One-time $12 key unlocks these forever. [Get a key →](https://nedcodes.lemonsqueezy.com/cursor-doctor)

### `cursor-doctor audit`

Deep analysis:

- **Stack detection** from package.json (Next.js, React, Express, Python, etc.)
- **Token budget breakdown** per rule, split by always-loaded vs conditional
- **Conflict detection** between rules (contradictory style directives)
- **Redundancy finder** (overlapping content across rule files)
- **Coverage gaps** with specific rule suggestions
- **Fix instructions** for every issue found

Export as markdown:

```bash
cursor-doctor audit --md > report.md
```

### `cursor-doctor fix`

Auto-fix common issues:

- Repair broken frontmatter
- Split oversized rule files (>1500 tokens)
- Flag redundant rules for manual review

Preview first:

```bash
cursor-doctor fix --dry-run
```

## Activate Pro

```bash
cursor-doctor activate <your-license-key>
```

Key is stored locally (hashed). No server calls, no telemetry.

## Built by [nedcodes](https://github.com/nedcodes-ok)

From the same person who brought you [cursor-lint](https://www.npmjs.com/package/cursor-lint) and the [cursorrules-collection](https://github.com/nedcodes-ok/cursorrules-collection).
