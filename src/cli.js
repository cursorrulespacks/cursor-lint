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
const { fixProject } = require('./fix');

const VERSION = '1.2.0';

// Global quiet mode flag
let QUIET_MODE = false;

// Logger utility that respects quiet mode
const logger = {
  log: function(...args) {
    if (!QUIET_MODE) console.log(...args);
  },
  error: function(...args) {
    // Errors are always shown regardless of quiet mode
    console.error(...args);
  },
  warn: function(...args) {
    if (!QUIET_MODE) console.warn(...args);
  }
};

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

var PURCHASE_URL = 'https://nedcodes.gumroad.com/l/cursor-doctor-pro';

function showHelp() {
  var lines = [
    '',
    CYAN + BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- Fix your Cursor AI setup in seconds.',
    '',
    YELLOW + 'Usage:' + RESET,
    '  npx cursor-doctor              # Run health check (default)',
    '  npx cursor-doctor scan         # Same as above',
    '  npx cursor-doctor check        # Quick pass/fail for CI',
    '  npx cursor-doctor lint         # Detailed rule linting',
    '  npx cursor-doctor migrate      # Convert .cursorrules to .mdc',
    '  npx cursor-doctor stats        # Token usage dashboard',
    '',
    YELLOW + 'Options:' + RESET,
    '  --quiet, -q                    # Suppress non-error output',
    '  --json                         # Output as JSON',
    '  --help, -h                     # Show help',
    '  --version, -v                  # Show version',
    '',
    YELLOW + 'Pro Commands ($9 one-time key):' + RESET,
    '  npx cursor-doctor audit        # Full diagnostic report',
    '  npx cursor-doctor audit --md   # Export audit as markdown',
    '  npx cursor-doctor fix          # Auto-fix issues',
    '  npx cursor-doctor fix --dry-run # Preview fixes',
    '',
    YELLOW + 'Other:' + RESET,
    '  npx cursor-doctor activate <key>  # Activate license',
    '',
    DIM + 'Get a Pro key: ' + PURCHASE_URL + '?utm_source=cli&utm_medium=npx&utm_campaign=help' + RESET,
    '',
  ];
  logger.log(lines.join('\n'));
}

function requirePro(dir) {
  if (isLicensed(dir)) return true;
  logger.log();
  logger.log(YELLOW + BOLD + 'Pro feature — $9 one-time, no subscription.' + RESET);
  logger.log();
  logger.log('  Includes: audit (full diagnostics), fix (auto-repair),');
  logger.log('  conflict detection, redundancy cleanup, stack templates.');
  logger.log();
  logger.log('  ' + CYAN + PURCHASE_URL + '?utm_source=cli&utm_medium=npx&utm_campaign=paywall' + RESET);
  logger.log('  Then: ' + DIM + 'cursor-doctor activate <your-key>' + RESET);
  logger.log();
  return false;
}

async function main() {
  var args = process.argv.slice(2);

  // Parse quiet flag early
  if (args.includes('--quiet') || args.includes('-q')) {
    QUIET_MODE = true;
  }

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    logger.log(VERSION);
    process.exit(0);
  }

  var cwd = process.cwd();
  var asJson = args.includes('--json');
  var command = args.find(function(a) { return !a.startsWith('-'); }) || 'scan';

  // --- activate ---
  if (command === 'help') { showHelp(); process.exit(0); }
  if (command === 'version') { console.log(VERSION); process.exit(0); }

  if (command === 'activate') {
    var key = args[1];
    if (!key) {
      logger.error(RED + 'Usage: cursor-doctor activate <key>' + RESET);
      process.exit(1);
    }
    var result = await activateLicense(cwd, key);
    if (result.ok) {
      logger.log(GREEN + 'License activated.' + RESET + ' Pro commands unlocked.');
      logger.log(DIM + 'Saved to ' + result.path + RESET);
    } else {
      logger.error(RED + 'Activation failed: ' + RESET + result.error);
      process.exit(1);
    }
    process.exit(0);
  }

  // --- scan (free, default) ---
  if (command === 'scan') {
    var report = await doctor(cwd);

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.grade === 'F' ? 1 : 0);
    }

    var gradeColors = { A: GREEN, B: GREEN, C: YELLOW, D: YELLOW, F: RED };
    var gradeEmoji = { A: String.fromCharCode(11088), B: String.fromCharCode(10004), C: String.fromCharCode(9888), D: String.fromCharCode(9881), F: String.fromCharCode(128680) };
    var gc = gradeColors[report.grade] || RESET;

    logger.log();
    logger.log('  ' + gc + BOLD + String.fromCharCode(9618).repeat(2) + ' Cursor Health: ' + report.grade + ' ' + String.fromCharCode(9618).repeat(2) + RESET);
    logger.log();

    // Progress bar
    var barWidth = 30;
    var filled = Math.round((report.percentage / 100) * barWidth);
    var empty = barWidth - filled;
    var bar = gc + String.fromCharCode(9608).repeat(filled) + RESET + DIM + String.fromCharCode(9617).repeat(empty) + RESET;
    logger.log('  ' + bar + '  ' + gc + BOLD + report.percentage + '%' + RESET);
    logger.log();

    for (var i = 0; i < report.checks.length; i++) {
      var check = report.checks[i];
      var icon;
      if (check.status === 'pass') icon = GREEN + String.fromCharCode(10003) + RESET;
      else if (check.status === 'warn') icon = YELLOW + String.fromCharCode(9888) + RESET;
      else if (check.status === 'fail') icon = RED + String.fromCharCode(10007) + RESET;
      else icon = BLUE + String.fromCharCode(8505) + RESET;
      logger.log('  ' + icon + ' ' + BOLD + check.name + RESET);
      logger.log('    ' + DIM + check.detail + RESET);
    }
    logger.log();

    var passes = report.checks.filter(function(c) { return c.status === 'pass'; }).length;
    var fixable = report.checks.filter(function(c) { return c.status === 'fail' || c.status === 'warn'; }).length;
    logger.log('  ' + GREEN + passes + ' passed' + RESET + '  ' + (fixable > 0 ? YELLOW + fixable + ' fixable' + RESET : ''));
    logger.log();

    if (fixable > 0) {
      logger.log('  ' + CYAN + 'Auto-fix:' + RESET + ' npx cursor-doctor fix');
      logger.log('  ' + CYAN + 'Full diagnostic:' + RESET + ' npx cursor-doctor audit');
      logger.log('  ' + DIM + 'Pro ($9 one-time) ' + PURCHASE_URL + '?utm_source=cli&utm_medium=npx&utm_campaign=scan' + RESET);
      logger.log();
    }

    process.exit(report.grade === 'F' ? 1 : 0);
  }

  // --- check (free, CI) ---
  if (command === 'check') {
    var report = await doctor(cwd);
    var issues = report.checks.filter(function(c) { return c.status === 'fail' || c.status === 'warn'; });

    if (issues.length === 0) {
      logger.log(GREEN + String.fromCharCode(10003) + RESET + ' Cursor setup healthy (' + report.grade + ', ' + report.percentage + '%)');
      process.exit(0);
    }

    for (var i = 0; i < issues.length; i++) {
      var issue = issues[i];
      var icon = issue.status === 'fail' ? RED + String.fromCharCode(10007) + RESET : YELLOW + String.fromCharCode(9888) + RESET;
      logger.log(icon + ' ' + issue.name + ': ' + issue.detail);
    }
    logger.log('\nGrade: ' + report.grade + ' (' + report.percentage + '%)');
    process.exit(1);
  }

  // --- lint (free) ---
  if (command === 'lint') {
    logger.log();
    logger.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- lint');
    logger.log();
    var results = await lintProject(cwd);
    var totalErrors = 0;
    var totalWarnings = 0;
    var totalPassed = 0;
    for (var i = 0; i < results.length; i++) {
      var result = results[i];
      var relPath = path.relative(cwd, result.file) || result.file;
      logger.log(relPath);
      if (result.issues.length === 0) {
        logger.log('  ' + GREEN + String.fromCharCode(10003) + ' All checks passed' + RESET);
        totalPassed++;
      } else {
        for (var j = 0; j < result.issues.length; j++) {
          var issue = result.issues[j];
          var icon;
          if (issue.severity === 'error') { icon = RED + String.fromCharCode(10007) + RESET; totalErrors++; }
          else if (issue.severity === 'warning') { icon = YELLOW + String.fromCharCode(9888) + RESET; totalWarnings++; }
          else { icon = BLUE + String.fromCharCode(8505) + RESET; }
          var lineInfo = issue.line ? ' ' + DIM + '(line ' + issue.line + ')' + RESET : '';
          logger.log('  ' + icon + ' ' + issue.message + lineInfo);
          if (issue.hint) logger.log('    ' + DIM + String.fromCharCode(8594) + ' ' + issue.hint + RESET);
        }
      }
      logger.log();
    }
    logger.log(String.fromCharCode(9472).repeat(50));
    var parts = [];
    if (totalErrors > 0) parts.push(RED + totalErrors + ' error(s)' + RESET);
    if (totalWarnings > 0) parts.push(YELLOW + totalWarnings + ' warning(s)' + RESET);
    if (totalPassed > 0) parts.push(GREEN + totalPassed + ' passed' + RESET);
    logger.log(parts.join(', '));
    logger.log();
    process.exit(totalErrors > 0 ? 1 : 0);
  }

  // --- migrate (free) ---
  if (command === 'migrate') {
    logger.log();
    logger.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- migrate');
    logger.log();
    var result = migrate(cwd);
    if (result.error) {
      logger.error(RED + String.fromCharCode(10007) + RESET + ' ' + result.error);
      process.exit(1);
    }
    logger.log(CYAN + 'Source:' + RESET + ' .cursorrules (' + result.source.lines + ' lines)');
    logger.log();
    if (result.created.length > 0) {
      logger.log(GREEN + 'Created:' + RESET);
      for (var i = 0; i < result.created.length; i++) logger.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' .cursor/rules/' + result.created[i]);
    }
    if (result.skipped.length > 0) {
      logger.log(YELLOW + 'Skipped:' + RESET);
      for (var i = 0; i < result.skipped.length; i++) logger.log('  ' + YELLOW + String.fromCharCode(9888) + RESET + ' .cursor/rules/' + result.skipped[i]);
    }
    logger.log();
    logger.log(DIM + '.cursorrules was NOT deleted -- verify, then remove manually.' + RESET);
    logger.log();
    process.exit(0);
  }

  // --- stats (free) ---
  if (command === 'stats') {
    logger.log();
    logger.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- stats');
    logger.log();
    var stats = showStats(cwd);
    logger.log(CYAN + 'Rules:' + RESET + '  ' + stats.mdcFiles.length + ' .mdc | ' + stats.skillFiles.length + ' skills | ~' + stats.totalTokens + ' tokens');
    logger.log(CYAN + 'Tiers:' + RESET + '  ' + stats.tiers.always + ' always | ' + stats.tiers.glob + ' glob | ' + stats.tiers.manual + ' manual');
    if (stats.mdcFiles.length > 0) {
      logger.log();
      logger.log(CYAN + 'Biggest files:' + RESET);
      var sorted = stats.mdcFiles.slice().sort(function(a, b) { return b.tokens - a.tokens; }).slice(0, 5);
      for (var i = 0; i < sorted.length; i++) {
        var f = sorted[i];
        var pct = Math.round((f.tokens / stats.totalTokens) * 100);
        logger.log('  ' + f.file.padEnd(30) + ' ' + String(f.tokens).padStart(5) + ' tokens (' + pct + '%)');
      }
    }
    logger.log();
    process.exit(0);
  }

  // --- audit (PRO) ---
  if (command === 'audit') {
    if (!requirePro(cwd)) process.exit(1);
    var report = await fullAudit(cwd);
    if (args.includes('--md')) {
      process.stdout.write(formatAuditMarkdown(report));
    } else {
      logger.log();
      logger.log(CYAN + BOLD + 'cursor-doctor audit' + RESET);
      logger.log();
      for (var i = 0; i < report.sections.length; i++) {
        var section = report.sections[i];
        logger.log(BOLD + section.title + RESET);
        for (var j = 0; j < section.items.length; j++) {
          var item = section.items[j];
          var icon;
          if (item.type === 'pass') icon = GREEN + String.fromCharCode(10003) + RESET;
          else if (item.type === 'error') icon = RED + String.fromCharCode(10007) + RESET;
          else if (item.type === 'warning') icon = YELLOW + '!' + RESET;
          else if (item.type === 'fix') icon = BLUE + String.fromCharCode(8594) + RESET;
          else icon = DIM + String.fromCharCode(183) + RESET;
          logger.log('  ' + icon + ' ' + item.text);
        }
        logger.log();
      }
    }
    process.exit(0);
  }

  // --- fix (PRO) ---
  if (command === 'fix') {
    if (!requirePro(cwd)) process.exit(1);
    var dryRun = args.includes('--dry-run');
    var results = await autoFix(cwd, { dryRun: dryRun });

    logger.log();
    logger.log(CYAN + BOLD + 'cursor-doctor fix' + RESET + (dryRun ? ' ' + DIM + '(dry run)' + RESET : ''));
    logger.log();

    if (results.errors.length > 0) {
      for (var i = 0; i < results.errors.length; i++) {
        logger.error('  ' + RED + String.fromCharCode(10007) + RESET + ' ' + results.errors[i]);
      }
      process.exit(1);
    }

    var totalActions = results.fixed.length + results.splits.length + results.merged.length + 
                       results.annotated.length + results.generated.length + results.deduped.length;

    if (totalActions === 0) {
      logger.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' Nothing to fix. Setup looks clean.');
      logger.log();
      process.exit(0);
    }

    for (var i = 0; i < results.fixed.length; i++) {
      logger.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' ' + results.fixed[i].file + ': ' + results.fixed[i].change);
    }
    for (var i = 0; i < results.splits.length; i++) {
      logger.log('  ' + BLUE + String.fromCharCode(9986) + RESET + ' Split ' + results.splits[i].file + ' -> ' + results.splits[i].parts.join(', '));
    }
    for (var i = 0; i < results.merged.length; i++) {
      logger.log('  ' + CYAN + String.fromCharCode(8645) + RESET + ' Merged ' + results.merged[i].removed + ' into ' + results.merged[i].kept + ' (' + results.merged[i].overlapPct + '% overlap)');
    }
    for (var i = 0; i < results.annotated.length; i++) {
      logger.log('  ' + YELLOW + String.fromCharCode(9888) + RESET + ' Annotated ' + results.annotated[i].file + ' (conflicts with ' + results.annotated[i].conflictsWith + ')');
    }
    for (var i = 0; i < results.generated.length; i++) {
      logger.log('  ' + GREEN + String.fromCharCode(10010) + RESET + ' Generated ' + results.generated[i].file + ' (' + results.generated[i].reason + ')');
    }
    for (var i = 0; i < results.deduped.length; i++) {
      logger.log('  ' + YELLOW + '!' + RESET + ' ' + results.deduped[i].fileA + ' + ' + results.deduped[i].fileB + ': ' + results.deduped[i].overlapPct + '% overlap (manual review)');
    }
    logger.log();
    process.exit(0);
  }

  // --- unknown ---
  logger.error('Unknown command: ' + command);
  logger.log('Run ' + DIM + 'cursor-doctor help' + RESET + ' for usage.');
  process.exit(1);
}

main().catch(function(err) {
  logger.error(RED + 'Error:' + RESET + ' ' + err.message);
  process.exit(1);
});
