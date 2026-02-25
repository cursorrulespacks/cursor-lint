#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { lintProject } = require('./index');
const { showStats } = require('./stats');
const { migrate } = require('./migrate');
const { doctor } = require('./doctor');
const { fullAudit, formatAuditMarkdown } = require('./audit');
const { autoFix } = require('./autofix');
const { isLicensed, activateLicense } = require('./license');

const VERSION = '1.0.0';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function showHelp() {
  const lines = [
    '',
    CYAN + BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' — Fix your Cursor AI setup in seconds.',
    '',
    YELLOW + 'Usage:' + RESET,
    '  npx cursor-doctor              # Run health check (default)',
    '  npx cursor-doctor scan         # Same as above',
    '  npx cursor-doctor check        # Quick pass/fail for CI',
    '  npx cursor-doctor migrate      # Convert .cursorrules to .mdc',
    '',
    YELLOW + 'Pro Commands ($9 one-time key):' + RESET,
    '  npx cursor-doctor audit        # Full diagnostic report',
    '  npx cursor-doctor audit --md   # Export audit as markdown',
    '  npx cursor-doctor fix          # Auto-fix issues',
    '  npx cursor-doctor fix --dry-run # Preview fixes',
    '',
    YELLOW + 'Other:' + RESET,
    '  npx cursor-doctor activate <key>  # Activate license',
    '  npx cursor-doctor stats           # Token usage dashboard',
    '  npx cursor-doctor lint            # Detailed rule linting',
    '',
    YELLOW + 'What it checks:' + RESET,
    '  * Rule syntax and YAML frontmatter errors',
    '  * Legacy .cursorrules that should be migrated',
    '  * Token budget across all rules',
    '  * Coverage gaps (missing rules for your file types)',
    '  * Conflicting or redundant rules',
    '  * alwaysApply overuse',
    '  * Agent skills setup',
    '',
    DIM + 'Get a Pro key: https://nedcodes.gumroad.com/l/cursor-doctor' + RESET,
    '',
  ];
  console.log(lines.join('\n'));
}

async function runScan(dir, asJson) {
  const report = await doctor(dir);

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  console.log();
  const gradeColors = { A: GREEN, B: GREEN, C: YELLOW, D: YELLOW, F: RED };
  const gc = gradeColors[report.grade] || RESET;
  console.log('  ' + gc + BOLD + 'Cursor Health: ' + report.grade + '  (' + report.percentage + '%)' + RESET);
  console.log('  ' + gc + '─'.repeat(34) + RESET);
  console.log();

  for (const check of report.checks) {
    let icon;
    if (check.status === 'pass') icon = GREEN + '✓' + RESET;
    else if (check.status === 'warn') icon = YELLOW + '⚠' + RESET;
    else if (check.status === 'fail') icon = RED + '✗' + RESET;
    else icon = BLUE + 'ℹ' + RESET;
    console.log('  ' + icon + ' ' + BOLD + check.name + RESET);
    console.log('    ' + DIM + check.detail + RESET);
  }
  console.log();

  const fixable = report.checks.filter(function(c) { return c.status === 'fail' || c.status === 'warn'; }).length;
  if (fixable > 0) {
    console.log('  ' + CYAN + fixable + ' issue(s) found.' + RESET + ' Run ' + CYAN + 'cursor-doctor fix' + RESET + ' to auto-repair. ' + DIM + '(Pro)' + RESET);
    console.log();
  }

  if (report.grade === 'F' || report.grade === 'D') {
    console.log('  ' + YELLOW + 'Quick wins:' + RESET);
    console.log('    * ' + CYAN + 'cursor-doctor migrate' + RESET + ' — convert .cursorrules to .mdc');
    console.log();
  }

  return report;
}

async function runCheck(dir) {
  const report = await doctor(dir);
  const issues = report.checks.filter(function(c) { return c.status === 'fail' || c.status === 'warn'; });

  if (issues.length === 0) {
    console.log(GREEN + '✓' + RESET + ' Cursor setup healthy (' + report.grade + ', ' + report.percentage + '%)');
    process.exit(0);
  }

  for (const issue of issues) {
    const icon = issue.status === 'fail' ? RED + '✗' + RESET : YELLOW + '⚠' + RESET;
    console.log(icon + ' ' + issue.name + ': ' + issue.detail);
  }
  console.log('\nGrade: ' + report.grade + ' (' + report.percentage + '%)');
  process.exit(1);
}

function requirePro(dir) {
  if (isLicensed(dir)) return true;
  console.log();
  console.log(YELLOW + 'This is a Pro feature.' + RESET);
  console.log('Get a license key ($9 one-time): ' + CYAN + 'https://nedcodes.gumroad.com/l/cursor-doctor' + RESET);
  console.log('Then run: ' + DIM + 'cursor-doctor activate <your-key>' + RESET);
  console.log();
  return false;
}

function printAudit(report) {
  console.log();
  console.log(CYAN + BOLD + 'cursor-doctor audit' + RESET);
  console.log();

  for (const section of report.sections) {
    console.log(BOLD + section.title + RESET);
    for (const item of section.items) {
      let icon;
      if (item.type === 'pass') icon = GREEN + '✓' + RESET;
      else if (item.type === 'error') icon = RED + '✗' + RESET;
      else if (item.type === 'warning') icon = YELLOW + '!' + RESET;
      else if (item.type === 'fix') icon = BLUE + '→' + RESET;
      else icon = DIM + '·' + RESET;
      console.log('  ' + icon + ' ' + item.text);
    }
    console.log();
  }
}

function printFix(results, dryRun) {
  console.log();
  console.log(CYAN + BOLD + 'cursor-doctor fix' + RESET + (dryRun ? ' ' + DIM + '(dry run)' + RESET : ''));
  console.log();

  if (results.errors.length > 0) {
    for (const err of results.errors) {
      console.log('  ' + RED + '✗' + RESET + ' ' + err);
    }
    return;
  }

  if (results.fixed.length === 0 && results.splits.length === 0 && results.deduped.length === 0) {
    console.log('  ' + GREEN + '✓' + RESET + ' Nothing to fix. Setup looks clean.');
    console.log();
    return;
  }

  for (const f of results.fixed) {
    console.log('  ' + GREEN + '✓' + RESET + ' ' + f.file + ': ' + f.change);
  }
  for (const s of results.splits) {
    console.log('  ' + GREEN + '✓' + RESET + ' Split ' + s.file + ' → ' + s.parts.join(', '));
  }
  for (const d of results.deduped) {
    console.log('  ' + YELLOW + '!' + RESET + ' ' + d.fileA + ' + ' + d.fileB + ': ' + d.overlapPct + '% overlap');
  }
  console.log();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  const cwd = process.cwd();
  const asJson = args.includes('--json');
  const command = args.find(function(a) { return !a.startsWith('-'); }) || 'scan';

  if (command === 'help') {
    showHelp();
    process.exit(0);
  }

  if (command === 'version') {
    console.log(VERSION);
    process.exit(0);
  }

  if (command === 'activate') {
    const key = args[1];
    if (!key) {
      console.log(RED + 'Usage: cursor-doctor activate <key>' + RESET);
      process.exit(1);
    }
    const result = activateLicense(cwd, key);
    if (result.ok) {
      console.log(GREEN + '✓' + RESET + ' License activated. Pro commands unlocked.');
      console.log(DIM + 'Saved to ' + result.path + RESET);
    } else {
      console.log(RED + '✗' + RESET + ' ' + result.error);
      process.exit(1);
    }
    process.exit(0);
  }

  if (command === 'scan') {
    const report = await runScan(cwd, asJson);
    process.exit(report.grade === 'F' ? 1 : 0);
  }

  if (command === 'check') {
    await runCheck(cwd);
  }

  if (command === 'migrate') {
    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' — migrate');
    console.log();
    const result = migrate(cwd);
    if (result.error) {
      console.log(RED + '✗' + RESET + ' ' + result.error);
      process.exit(1);
    }
    console.log(CYAN + 'Source:' + RESET + ' .cursorrules (' + result.source.lines + ' lines)');
    console.log();
    if (result.created.length > 0) {
      console.log(GREEN + 'Created:' + RESET);
      for (const f of result.created) console.log('  ' + GREEN + '✓' + RESET + ' .cursor/rules/' + f);
    }
    if (result.skipped.length > 0) {
      console.log(YELLOW + 'Skipped:' + RESET);
      for (const f of result.skipped) console.log('  ' + YELLOW + '⚠' + RESET + ' .cursor/rules/' + f);
    }
    console.log();
    console.log(DIM + '.cursorrules was NOT deleted — verify, then remove manually.' + RESET);
    console.log();
    process.exit(0);
  }

  if (command === 'audit') {
    if (!requirePro(cwd)) process.exit(1);
    const report = await fullAudit(cwd);
    if (args.includes('--md')) {
      process.stdout.write(formatAuditMarkdown(report));
    } else {
      printAudit(report);
    }
    process.exit(0);
  }

  if (command === 'fix') {
    if (!requirePro(cwd)) process.exit(1);
    const dryRun = args.includes('--dry-run');
    const results = await autoFix(cwd, { dryRun: dryRun });
    printFix(results, dryRun);
    process.exit(0);
  }

  if (command === 'stats') {
    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' — stats');
    console.log();
    const stats = showStats(cwd);
    console.log(CYAN + 'Rules:' + RESET + '  ' + stats.mdcFiles.length + ' .mdc | ' + stats.skillFiles.length + ' skills | ~' + stats.totalTokens + ' tokens');
    console.log(CYAN + 'Tiers:' + RESET + '  ' + stats.tiers.always + ' always | ' + stats.tiers.glob + ' glob | ' + stats.tiers.manual + ' manual');
    if (stats.mdcFiles.length > 0) {
      console.log();
      console.log(CYAN + 'Biggest files:' + RESET);
      var sorted = stats.mdcFiles.slice().sort(function(a, b) { return b.tokens - a.tokens; }).slice(0, 5);
      for (const f of sorted) {
        var pct = Math.round((f.tokens / stats.totalTokens) * 100);
        console.log('  ' + f.file.padEnd(30) + ' ' + String(f.tokens).padStart(5) + ' tokens (' + pct + '%)');
      }
    }
    console.log();
    process.exit(0);
  }

  if (command === 'lint') {
    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' — lint');
    console.log();
    console.log('Scanning ' + cwd + '...');
    console.log();
    const results = await lintProject(cwd);
    let totalErrors = 0;
    let totalWarnings = 0;
    let totalPassed = 0;
    for (const result of results) {
      const relPath = path.relative(cwd, result.file) || result.file;
      console.log(relPath);
      if (result.issues.length === 0) {
        console.log('  ' + GREEN + '✓ All checks passed' + RESET);
        totalPassed++;
      } else {
        for (const issue of result.issues) {
          let icon;
          if (issue.severity === 'error') { icon = RED + '✗' + RESET; totalErrors++; }
          else if (issue.severity === 'warning') { icon = YELLOW + '⚠' + RESET; totalWarnings++; }
          else { icon = BLUE + 'ℹ' + RESET; }
          const lineInfo = issue.line ? ' ' + DIM + '(line ' + issue.line + ')' + RESET : '';
          console.log('  ' + icon + ' ' + issue.message + lineInfo);
          if (issue.hint) console.log('    ' + DIM + '→ ' + issue.hint + RESET);
        }
      }
      console.log();
    }
    console.log('─'.repeat(50));
    const parts = [];
    if (totalErrors > 0) parts.push(RED + totalErrors + ' error(s)' + RESET);
    if (totalWarnings > 0) parts.push(YELLOW + totalWarnings + ' warning(s)' + RESET);
    if (totalPassed > 0) parts.push(GREEN + totalPassed + ' passed' + RESET);
    console.log(parts.join(', '));
    console.log();
    process.exit(totalErrors > 0 ? 1 : 0);
  }

  console.log('Unknown command: ' + command);
  console.log('Run ' + DIM + 'cursor-doctor help' + RESET + ' for usage.');
  process.exit(1);
}

main().catch(function(err) {
  console.error(RED + 'Error:' + RESET + ' ' + err.message);
  process.exit(1);
});
