#!/usr/bin/env node

const path = require('path');
const { lintProject } = require('./index');

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

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

async function main() {
  console.log(`\n🔍 cursor-lint v${require('../package.json').version}\n`);
  console.log(`Scanning ${dir}...\n`);

  const results = await lintProject(dir);

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalPassed = 0;

  for (const result of results) {
    const relPath = path.relative(dir, result.file) || result.file;
    console.log(relPath);

    if (result.issues.length === 0) {
      console.log(`  ${GREEN}✓ All checks passed${RESET}`);
      totalPassed++;
    } else {
      for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? `${RED}✗${RESET}` : `${YELLOW}⚠${RESET}`;
        const lineInfo = issue.line ? ` ${DIM}(line ${issue.line})${RESET}` : '';
        console.log(`  ${icon} ${issue.message}${lineInfo}`);
        if (issue.hint) {
          console.log(`    ${DIM}→ ${issue.hint}${RESET}`);
        }
      }
      const errors = result.issues.filter(i => i.severity === 'error').length;
      const warnings = result.issues.filter(i => i.severity === 'warning').length;
      totalErrors += errors;
      totalWarnings += warnings;
      if (errors === 0 && warnings === 0) totalPassed++;
    }
    console.log();
  }

  console.log('─'.repeat(50));
  const parts = [];
  if (totalErrors > 0) parts.push(`${RED}${totalErrors} error${totalErrors !== 1 ? 's' : ''}${RESET}`);
  if (totalWarnings > 0) parts.push(`${YELLOW}${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''}${RESET}`);
  if (totalPassed > 0) parts.push(`${GREEN}${totalPassed} passed${RESET}`);
  console.log(parts.join(', ') + '\n');

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
