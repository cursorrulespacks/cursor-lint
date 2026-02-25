#!/usr/bin/env node

const path = require('path');
const { lintProject } = require('./index');
const { showStats } = require('./stats');
const { migrate } = require('./migrate');
const { doctor } = require('./doctor');
const { fullAudit, formatAuditMarkdown } = require('./audit');
const { autoFix } = require('./autofix');
const { isLicensed, activateLicense } = require('./license');
const fs = require('fs');

const VERSION = '1.0.0';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function showHelp() {
  console.log(`
${CYAN}${BOLD}cursor-doctor${RESET} v${VERSION}

Diagnose, audit, and fix your Cursor AI rules setup.

${YELLOW}Usage:${RESET}
  cursor-doctor <command> [options]

${YELLOW}Free Commands:${RESET}
  scan           Analyze .cursor/ directory — rule count, token estimates,
                 health score, broken YAML, deprecated files
  check          One-line-per-issue output, exit code 0/1 (CI-friendly)
  migrate        Move .cursorrules to .cursor/rules/ as .mdc files

${YELLOW}Pro Commands ($12 one-time key):${RESET}
  audit          Full report — conflicts, redundancy, token budget
                 breakdown, stack detection, fix instructions
  audit --md     Export audit as markdown file
  fix            Auto-fix broken frontmatter, split oversized files,
                 remove redundancy
  fix --dry-run  Preview fixes without writing

${YELLOW}Other:${RESET}
  activate <key>  Activate a license key
  help            Show this help message
  version         Show version

${YELLOW}Examples:${RESET}
  ${DIM}$ cursor-doctor scan${RESET}
  ${DIM}$ cursor-doctor check && echo "All clear!"${RESET}
  ${DIM}$ cursor-doctor audit --md > report.md${RESET}
  ${DIM}$ cursor-doctor fix --dry-run${RESET}

${DIM}Get a Pro key: https://nedcodes.lemonsqueezy.com/cursor-doctor${RESET}
`);
}

function printScan(report) {
  console.log(`\n${CYAN}${BOLD}cursor-doctor scan${RESET}\n`);
  
  for (const check of report.checks) {
    const icon = check.status === 'pass' ? `${GREEN}✓${RESET}` :
                 check.status === 'fail' ? `${RED}✗${RESET}` :
                 check.status === 'warn' ? `${YELLOW}!${RESET}` :
                 `${BLUE}i${RESET}`;
    console.log(`  ${icon} ${BOLD}${check.name}${RESET}: ${check.detail}`);
  }
  
  console.log(`\n  ${BOLD}Health Score: ${report.percentage >= 75 ? GREEN : report.percentage >= 50 ? YELLOW : RED}${report.grade} (${report.percentage}%)${RESET}\n`);
}

function printCheck(report) {
  let hasIssues = false;
  
  for (const check of report.checks) {
    if (check.status === 'fail' || check.status === 'warn') {
      hasIssues = true;
      const prefix = check.status === 'fail' ? `${RED}ERROR${RESET}` : `${YELLOW}WARN${RESET}`;
      console.log(`${prefix}: ${check.name} — ${check.detail}`);
    }
  }
  
  if (!hasIssues) {
    console.log(`${GREEN}OK${RESET}: All checks passed (${report.grade}, ${report.percentage}%)`);
  }
  
  return hasIssues;
}

function printAudit(report) {
  console.log(`\n${CYAN}${BOLD}cursor-doctor audit${RESET}\n`);
  
  for (const section of report.sections) {
    console.log(`${BOLD}${section.title}${RESET}`);
    for (const item of section.items) {
      const icon = item.type === 'pass' ? `${GREEN}✓${RESET}` :
                   item.type === 'error' ? `${RED}✗${RESET}` :
                   item.type === 'warning' ? `${YELLOW}!${RESET}` :
                   item.type === 'fix' ? `${BLUE}→${RESET}` :
                   `${DIM}·${RESET}`;
      console.log(`  ${icon} ${item.text}`);
    }
    console.log();
  }
}

function printFix(results) {
  console.log(`\n${CYAN}${BOLD}cursor-doctor fix${RESET}\n`);
  
  if (results.errors.length > 0) {
    for (const err of results.errors) {
      console.log(`  ${RED}✗${RESET} ${err}`);
    }
    return;
  }
  
  if (results.fixed.length === 0 && results.splits.length === 0 && results.deduped.length === 0) {
    console.log(`  ${GREEN}✓${RESET} Nothing to fix. Setup looks clean.`);
    return;
  }
  
  for (const f of results.fixed) {
    console.log(`  ${GREEN}✓${RESET} ${f.file}: ${f.change}`);
  }
  for (const s of results.splits) {
    console.log(`  ${GREEN}✓${RESET} Split ${s.file} → ${s.parts.join(', ')}`);
  }
  for (const d of results.deduped) {
    console.log(`  ${YELLOW}!${RESET} ${d.fileA} + ${d.fileB}: ${d.overlapPct}% overlap — ${d.action}`);
  }
  console.log();
}

function requirePro(dir) {
  if (isLicensed(dir)) return true;
  console.log(`\n${YELLOW}This is a Pro command.${RESET}`);
  console.log(`Get a license key ($12 one-time): ${CYAN}https://nedcodes.lemonsqueezy.com/cursor-doctor${RESET}`);
  console.log(`Then run: ${DIM}cursor-doctor activate <your-key>${RESET}\n`);
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }
  
  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(VERSION);
    process.exit(0);
  }
  
  const dir = process.cwd();
  
  if (command === 'activate') {
    const key = args[1];
    if (!key) {
      console.log(`${RED}Usage: cursor-doctor activate <key>${RESET}`);
      process.exit(1);
    }
    const result = activateLicense(dir, key);
    if (result.ok) {
      console.log(`${GREEN}✓${RESET} License activated. Pro commands unlocked.`);
      console.log(`${DIM}Saved to ${result.path}${RESET}`);
    } else {
      console.log(`${RED}✗${RESET} ${result.error}`);
      process.exit(1);
    }
    process.exit(0);
  }
  
  if (command === 'scan') {
    const report = await doctor(dir);
    printScan(report);
    process.exit(0);
  }
  
  if (command === 'check') {
    const report = await doctor(dir);
    const hasIssues = printCheck(report);
    process.exit(hasIssues ? 1 : 0);
  }
  
  if (command === 'migrate') {
    migrate(dir);
    process.exit(0);
  }
  
  if (command === 'audit') {
    if (!requirePro(dir)) process.exit(1);
    
    const report = await fullAudit(dir);
    
    if (args.includes('--md')) {
      const md = formatAuditMarkdown(report);
      process.stdout.write(md);
    } else {
      printAudit(report);
    }
    process.exit(0);
  }
  
  if (command === 'fix') {
    if (!requirePro(dir)) process.exit(1);
    
    const dryRun = args.includes('--dry-run');
    const results = await autoFix(dir, { dryRun });
    
    if (dryRun) {
      console.log(`${DIM}(dry run — no files changed)${RESET}`);
    }
    printFix(results);
    process.exit(0);
  }
  
  console.log(`${RED}Unknown command: ${command}${RESET}`);
  console.log(`Run ${DIM}cursor-doctor help${RESET} for usage.`);
  process.exit(1);
}

main().catch(err => {
  console.error(`${RED}Error:${RESET} ${err.message}`);
  process.exit(1);
});
