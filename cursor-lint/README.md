# cursor-lint

Lint your Cursor rules and verify code compliance.

## Quick Start

```bash
# Lint your rule files
npx cursor-lint

# Check if code follows your rules
npx cursor-lint --verify
```

## What It Does

### Default: Lint Rule Files

Catches common mistakes in `.cursorrules` and `.cursor/rules/*.mdc` files.

```
$ npx cursor-lint

🔍 cursor-lint v0.2.0

.cursorrules
  ⚠ .cursorrules may be ignored in agent mode
    → Use .cursor/rules/*.mdc with alwaysApply: true

.cursor/rules/code.mdc
  ✗ Missing alwaysApply: true
    → Add alwaysApply: true to frontmatter

1 error, 1 warning, 1 passed
```

### New in v0.2.0: `--verify` Flag

Check if your **code** actually follows your rules. Add `verify:` blocks to your `.mdc` frontmatter:

```yaml
---
description: TypeScript conventions
alwaysApply: true
globs: ["*.ts", "*.tsx"]
verify:
  - antipattern: "console\\.log"
    message: "Remove console.log statements"
  - antipattern: "any"
    message: "Avoid using 'any' type"
  - required: "export"
    message: "Files should export something"
---
```

Then run:

```
$ npx cursor-lint --verify

🔍 cursor-lint --verify v0.2.0

Found 1 rule(s) with verify blocks
Checked 12 file(s)

src/utils.ts
  ✗ Remove console.log statements
    Line 23
    Found: console.log
    Rule: typescript.mdc

1 violation(s) in 1 file(s)
```

### Verify Pattern Types

| Type | Behavior |
|------|----------|
| `pattern` | Regex that **must match** somewhere in the file |
| `antipattern` | Regex that **must not match** |
| `required` | Exact string that **must exist** |
| `forbidden` | Exact string that **must not exist** |

## Why This Exists

"Why are my rules being ignored?" — common Cursor forum question.

**For rule files:** Missing `alwaysApply`, using deprecated `.cursorrules`, vague rules like "write clean code."

**For code:** AI generates it, humans review it, but nobody systematically checks if it follows the rules you wrote. `--verify` automates that check.

## Rule Checks

| Check | Severity | Why |
|-------|----------|-----|
| `.cursorrules` in project | Warning | Agent mode ignores it |
| Missing `alwaysApply: true` | Error | Rules won't load |
| Missing `description` | Warning | Helps Cursor pick the right rule |
| Vague rules | Warning | "Write clean code" doesn't change behavior |
| File too long | Warning/Error | May be truncated |
| Invalid YAML | Error | Won't parse |
| Bad glob syntax | Error | Pattern matching fails |

## Installation

```bash
# Run directly (recommended)
npx cursor-lint
npx cursor-lint --verify

# Or install globally
npm install -g cursor-lint
```

## CI Integration

```yaml
# GitHub Actions
- name: Lint Cursor rules
  run: npx cursor-lint

- name: Verify code compliance
  run: npx cursor-lint --verify
```

## Need Help With Your Cursor Setup?

I do async audits — I'll review your rules, run cursor-lint, and send you a report with exactly what to fix. No calls, just results.

DM me on [Dev.to](https://dev.to/nedcodes) or the [Cursor Forum](https://forum.cursor.com/u/nedcodes).

## License

MIT
