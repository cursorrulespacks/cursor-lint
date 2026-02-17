#!/usr/bin/env node

const path = require('path');
const { lint } = require('./index');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
cursor-lint — Lint your Cursor rules

Usage:
  cursor-lint [directory]    Lint rules in directory (default: current dir)
  cursor-lint --help         Show this help
  cursor-lint --version      Show version

Checks:
  ✗ Missing alwaysApply: true in .mdc files
  ✗ Bad YAML frontmatter / glob syntax
  ⚠ .cursorrules ignored in agent mode
  ⚠ Vague rules ("write clean code", etc.)
  ⚠ Files too long for context window
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = require('../package.json');
  console.log(`cursor-lint v${pkg.version}`);
  process.exit(0);
}

const dir = args[0] ? path.resolve(args[0]) : process.cwd();

console.log(`\n🔍 cursor-lint v${require('../package.json').version}\n`);
console.log(`Scanning ${dir}...\n`);

const result = lint(dir);

if (result.noFiles) {
  console.log('No rule files found (.cursorrules or .cursor/rules/*.mdc)\n');
  process.exit(0);
}

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

for (const file of result.files) {
  console.log(`${file.file}`);

  if (file.issues.length === 0) {
    console.log(`  ${GREEN}✓ All checks passed${RESET}`);
  } else {
    for (const issue of file.issues) {
      const icon = issue.type === 'error' ? `${RED}✗${RESET}` : `${YELLOW}⚠${RESET}`;
      const lineInfo = issue.line ? ` ${DIM}(line ${issue.line})${RESET}` : '';
      console.log(`  ${icon} ${issue.message}${lineInfo}`);
      if (issue.hint) {
        console.log(`    ${DIM}→ ${issue.hint}${RESET}`);
      }
    }
  }
  console.log();
}

console.log('─'.repeat(50));
const parts = [];
if (result.totalErrors > 0) parts.push(`${RED}${result.totalErrors} error${result.totalErrors !== 1 ? 's' : ''}${RESET}`);
if (result.totalWarnings > 0) parts.push(`${YELLOW}${result.totalWarnings} warning${result.totalWarnings !== 1 ? 's' : ''}${RESET}`);
if (result.totalPassed > 0) parts.push(`${GREEN}${result.totalPassed} passed${RESET}`);
console.log(parts.join(', ') + '\n');

process.exit(result.totalErrors > 0 ? 1 : 0);
