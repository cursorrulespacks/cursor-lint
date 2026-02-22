#!/usr/bin/env node

const path = require('path');
const { lintProject } = require('./index');
const { verifyProject } = require('./verify');
const { initProject } = require('./init');
const { fixProject } = require('./fix');
const { generateRules, suggestSkills, listPresets, generateFromPreset } = require('./generate');
const { checkVersions, checkRuleVersionMismatches } = require('./versions');
const { showStats } = require('./stats');
const { migrate } = require('./migrate');
const { doctor } = require('./doctor');
const { saveSnapshot, diffSnapshot } = require('./diff');

const VERSION = '0.13.0';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const SNAPSHOT_FILE = '.cursor-lint-snapshot.json';

function showHelp() {
  console.log(`
${CYAN}cursor-lint${RESET} v${VERSION}

Lint your Cursor rules and verify code compliance.

${YELLOW}Usage:${RESET}
  npx cursor-lint [options]

${YELLOW}Options:${RESET}
  --help, -h     Show this help message
  --version, -v  Show version number
  --verify       Check if code follows rules with verify: blocks
  --init         Generate starter .mdc rules (auto-detects your stack)
  --fix          Auto-fix common issues (missing frontmatter, alwaysApply)
  --generate     Auto-detect stack & download matching .mdc rules from GitHub
  --generate --preset <name>  Install rules for a popular stack preset
  --generate --preset list    Show available presets
  --order        Show rule load order, priority tiers, and token estimates
  --version-check  Detect installed package versions and show relevant rule tips
  --stats        Show rule health dashboard (counts, tokens, coverage)
  --migrate      Convert .cursorrules to .cursor/rules/*.mdc format
  --doctor       Full project health check with letter grade
  --diff save    Save current rules as snapshot
  --diff         Compare current rules to saved snapshot

${YELLOW}What it checks (default):${RESET}
  • .cursorrules files (warns about agent mode compatibility)
  • .cursor/rules/*.mdc files (frontmatter, alwaysApply, etc.)
  • Agent skill files (SKILL.md in .claude/skills/, skills/)
  • Vague rules that won't change AI behavior
  • YAML syntax errors
  • Rule length (token waste detection)
  • Missing code examples in rules
  • Empty rule bodies, URL-only rules
  • Description quality (too short/long)
  • Glob pattern issues (too broad, spaces, missing extensions)
  • Excessive rule count (>20 files)
  • Duplicate/near-duplicate rules across files
  • Conflicting directives between rules

${YELLOW}What --verify checks:${RESET}
  • Scans code files matching rule globs
  • Checks for required patterns (pattern:, required:)
  • Catches forbidden patterns (antipattern:, forbidden:)
  • Reports violations with line numbers

${YELLOW}verify: block syntax in .mdc frontmatter:${RESET}
  ---
  globs: ["*.ts", "*.tsx"]
  verify:
    - pattern: "^import.*from '@/"
      message: "Use @/ alias for imports"
    - antipattern: "console\\\\.log"
      message: "Remove console.log"
    - required: "use strict"
      message: "Missing use strict"
    - forbidden: "TODO"
      message: "Resolve TODOs before commit"
  ---

${YELLOW}Examples:${RESET}
  npx cursor-lint              # Lint rule files
  npx cursor-lint --verify     # Check code against rules
  npx cursor-lint --init       # Generate starter rules for your project
  npx cursor-lint --generate   # Download community rules for your stack

${YELLOW}More info:${RESET}
  https://github.com/nedcodes-ok/cursor-lint
`);
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
  const isVerify = args.includes('--verify');
  const isInit = args.includes('--init');
  const isFix = args.includes('--fix');
  const isGenerate = args.includes('--generate');
  const isOrder = args.includes('--order');
  const isVersionCheck = args.includes('--version-check');
  const isStats = args.includes('--stats');
  const isMigrate = args.includes('--migrate');
  const isDoctor = args.includes('--doctor');
  const isDiff = args.includes('--diff');

  if (isVersionCheck) {
    console.log(`\n📦 cursor-lint v${VERSION} --version-check\n`);
    console.log(`Detecting installed versions in ${cwd}...\n`);

    const versionNotes = checkVersions(cwd);
    const mismatches = checkRuleVersionMismatches(cwd);

    if (versionNotes.length === 0 && mismatches.length === 0) {
      console.log(`${YELLOW}No version-specific notes found.${RESET}`);
      console.log(`${DIM}Supports: package.json, requirements.txt, pyproject.toml${RESET}\n`);
      process.exit(0);
    }

    if (versionNotes.length > 0) {
      console.log(`${CYAN}Version-specific features available:${RESET}\n`);
      for (const item of versionNotes) {
        console.log(`  ${GREEN}${item.package}${RESET} ${DIM}(${item.installedVersion})${RESET}`);
        for (const note of item.notes) {
          console.log(`    ${DIM}→${RESET} ${note}`);
        }
        console.log();
      }
    }

    if (mismatches.length > 0) {
      console.log(`${YELLOW}Version mismatches in your rules:${RESET}\n`);
      for (const m of mismatches) {
        console.log(`  ${YELLOW}⚠${RESET} ${m.file}:${m.line} — ${m.message}`);
      }
      console.log();
    }

    console.log('─'.repeat(50));
    console.log(`${DIM}Use these notes to customize your .mdc rules for your exact versions.${RESET}\n`);
    process.exit(mismatches.length > 0 ? 1 : 0);

  } else if (isStats) {
    console.log(`\n📊 cursor-lint v${VERSION} --stats\n`);
    console.log(`Scanning ${cwd}...\n`);
    const stats = showStats(cwd);
    
    // Summary
    console.log(`${CYAN}Rule files:${RESET}`);
    console.log(`  .mdc files:     ${stats.mdcFiles.length}`);
    if (stats.hasCursorrules) console.log(`  .cursorrules:   1 (legacy — run --migrate)`);
    console.log(`  Skill files:    ${stats.skillFiles.length}`);
    console.log(`  Total tokens:   ~${stats.totalTokens}`);
    console.log();
    
    // Tier breakdown
    console.log(`${CYAN}Rule tiers:${RESET}`);
    console.log(`  Always active:  ${stats.tiers.always}`);
    console.log(`  Glob-matched:   ${stats.tiers.glob}`);
    console.log(`  Manual only:    ${stats.tiers.manual}`);
    console.log();
    
    // Token breakdown by file
    if (stats.mdcFiles.length > 0) {
      console.log(`${CYAN}Token breakdown:${RESET}`);
      const sorted = [...stats.mdcFiles].sort((a, b) => b.tokens - a.tokens);
      for (const f of sorted) {
        const bar = '█'.repeat(Math.max(1, Math.round(f.tokens / 50)));
        const pct = Math.round((f.tokens / stats.totalTokens) * 100);
        console.log(`  ${f.file.padEnd(30)} ${String(f.tokens).padStart(5)} tokens (${String(pct).padStart(2)}%) ${DIM}${bar}${RESET}`);
      }
      console.log();
    }
    
    // Coverage gaps
    if (stats.coverageGaps.length > 0) {
      console.log(`${YELLOW}Coverage gaps:${RESET}`);
      for (const gap of stats.coverageGaps) {
        console.log(`  ${YELLOW}⚠${RESET} ${gap.ext} files found but no matching rule`);
        console.log(`    ${DIM}→ Try: --generate (suggests ${gap.suggestedRules.join(', ')})${RESET}`);
      }
    } else if (stats.mdcFiles.length > 0) {
      console.log(`${GREEN}✓ No coverage gaps detected${RESET}`);
    }
    
    console.log();
    process.exit(0);

  } else if (isMigrate) {
    console.log(`\n🔄 cursor-lint v${VERSION} --migrate\n`);
    const result = migrate(cwd);
    
    if (result.error) {
      console.log(`${RED}✗${RESET} ${result.error}`);
      process.exit(1);
    }
    
    console.log(`${CYAN}Source:${RESET} .cursorrules (${result.source.lines} lines, ${result.source.chars} chars)\n`);
    
    if (result.created.length > 0) {
      console.log(`${GREEN}Created:${RESET}`);
      for (const f of result.created) {
        console.log(`  ${GREEN}✓${RESET} .cursor/rules/${f}`);
      }
    }
    
    if (result.skipped.length > 0) {
      console.log(`${YELLOW}Skipped (already exists):${RESET}`);
      for (const f of result.skipped) {
        console.log(`  ${YELLOW}⚠${RESET} .cursor/rules/${f}`);
      }
    }
    
    console.log();
    console.log(`${DIM}Your .cursorrules file was NOT deleted — verify the migration, then remove it manually.${RESET}`);
    console.log(`${DIM}Run cursor-lint to check the new rules.${RESET}\n`);
    process.exit(0);

  } else if (isDoctor) {
    console.log(`\n🏥 cursor-lint v${VERSION} --doctor\n`);
    console.log(`Running full health check on ${cwd}...\n`);
    const report = await doctor(cwd);
    
    // Grade display
    const gradeColors = { A: GREEN, B: GREEN, C: YELLOW, D: YELLOW, F: RED };
    const gradeColor = gradeColors[report.grade] || RESET;
    console.log(`  ${gradeColor}${'━'.repeat(30)}${RESET}`);
    console.log(`  ${gradeColor}  Project Health: ${report.grade} (${report.percentage}%)  ${RESET}`);
    console.log(`  ${gradeColor}${'━'.repeat(30)}${RESET}\n`);
    
    // Check results
    for (const check of report.checks) {
      let icon;
      if (check.status === 'pass') icon = `${GREEN}✓${RESET}`;
      else if (check.status === 'warn') icon = `${YELLOW}⚠${RESET}`;
      else if (check.status === 'fail') icon = `${RED}✗${RESET}`;
      else icon = `${BLUE}ℹ${RESET}`;
      
      console.log(`  ${icon} ${check.name}`);
      console.log(`    ${DIM}${check.detail}${RESET}`);
    }
    
    console.log();
    
    // Suggestions based on grade
    if (report.grade === 'F' || report.grade === 'D') {
      console.log(`${YELLOW}Quick wins:${RESET}`);
      console.log(`  • Run ${CYAN}cursor-lint --init${RESET} to create starter rules`);
      console.log(`  • Run ${CYAN}cursor-lint --generate${RESET} to download rules for your stack`);
      if (report.checks.some(c => c.name === 'No legacy .cursorrules' && c.status === 'warn')) {
        console.log(`  • Run ${CYAN}cursor-lint --migrate${RESET} to convert .cursorrules to .mdc`);
      }
    } else if (report.grade === 'C') {
      console.log(`${YELLOW}Improvements:${RESET}`);
      console.log(`  • Run ${CYAN}cursor-lint --fix${RESET} to auto-repair common issues`);
      console.log(`  • Run ${CYAN}cursor-lint --stats${RESET} to find token waste`);
    }
    
    console.log();
    process.exit(report.grade === 'F' ? 1 : 0);

  } else if (isDiff) {
    const isDiffSave = args.includes('save');
    
    if (isDiffSave) {
      console.log(`\n📸 cursor-lint v${VERSION} --diff save\n`);
      const { path: snapPath, state } = saveSnapshot(cwd);
      const ruleCount = Object.keys(state.rules).length;
      console.log(`${GREEN}✓${RESET} Snapshot saved to ${path.basename(snapPath)}`);
      console.log(`  ${DIM}${ruleCount} rule${ruleCount !== 1 ? 's' : ''} captured at ${state.timestamp}${RESET}\n`);
      console.log(`${DIM}Add ${SNAPSHOT_FILE} to .gitignore, or commit it to track rule changes.${RESET}\n`);
      process.exit(0);
    }
    
    console.log(`\n📊 cursor-lint v${VERSION} --diff\n`);
    const changes = diffSnapshot(cwd);
    
    if (changes.error) {
      console.log(`${RED}✗${RESET} ${changes.error}\n`);
      process.exit(1);
    }
    
    console.log(`${DIM}Comparing to snapshot from ${changes.savedAt}${RESET}\n`);
    
    if (!changes.hasChanges) {
      console.log(`${GREEN}✓ No changes since last snapshot${RESET}\n`);
      process.exit(0);
    }
    
    if (changes.added.length > 0) {
      console.log(`${GREEN}Added:${RESET}`);
      for (const f of changes.added) {
        console.log(`  ${GREEN}+${RESET} ${f.file} (${f.tokens} tokens, ${f.lines} lines)`);
      }
      console.log();
    }
    
    if (changes.removed.length > 0) {
      console.log(`${RED}Removed:${RESET}`);
      for (const f of changes.removed) {
        console.log(`  ${RED}-${RESET} ${f.file} (${f.tokens} tokens, ${f.lines} lines)`);
      }
      console.log();
    }
    
    if (changes.modified.length > 0) {
      console.log(`${YELLOW}Modified:${RESET}`);
      for (const f of changes.modified) {
        const tokenDiff = f.newTokens - f.oldTokens;
        const sign = tokenDiff >= 0 ? '+' : '';
        console.log(`  ${YELLOW}~${RESET} ${f.file} (${sign}${tokenDiff} tokens, ${f.oldLines}→${f.newLines} lines)`);
      }
      console.log();
    }
    
    // Summary
    const sign = changes.tokenDelta >= 0 ? '+' : '';
    console.log(`${CYAN}Summary:${RESET} ${changes.added.length} added, ${changes.removed.length} removed, ${changes.modified.length} modified (${sign}${changes.tokenDelta} tokens)\n`);
    
    // Exit 1 if changes detected (useful for CI)
    process.exit(1);

  } else if (isOrder) {
    const { showLoadOrder } = require('./order');
    console.log(`\n📋 cursor-lint v${VERSION} --order\n`);
    const dir = args.find(a => !a.startsWith('-')) ? path.resolve(args.find(a => !a.startsWith('-'))) : cwd;
    console.log(`Analyzing rule load order in ${dir}...\n`);

    const results = showLoadOrder(dir);

    if (results.rules.length === 0) {
      console.log(`${YELLOW}No rules found.${RESET}\n`);
      process.exit(0);
    }

    // Show .cursorrules warning if present
    if (results.hasCursorrules) {
      console.log(`${YELLOW}⚠ .cursorrules found${RESET} — overridden by any .mdc rule covering the same topic`);
      console.log(`${DIM}  .mdc files always take precedence when both exist${RESET}\n`);
    }

    // Group by priority tier
    const tiers = {
      'always': { label: 'Always Active', color: GREEN, rules: [] },
      'glob': { label: 'File-Scoped (glob match)', color: CYAN, rules: [] },
      'manual': { label: 'Manual Only (no alwaysApply, no globs)', color: DIM, rules: [] },
    };

    for (const rule of results.rules) {
      tiers[rule.tier].rules.push(rule);
    }

    let position = 1;
    for (const [key, tier] of Object.entries(tiers)) {
      if (tier.rules.length === 0) continue;
      console.log(`${tier.color}── ${tier.label} ──${RESET}`);
      for (const rule of tier.rules) {
        const globs = rule.globs.length > 0 ? ` ${DIM}[${rule.globs.join(', ')}]${RESET}` : '';
        const desc = rule.description ? ` ${DIM}— ${rule.description}${RESET}` : '';
        const size = ` ${DIM}(${rule.lines} lines, ~${rule.tokens} tokens)${RESET}`;
        console.log(`  ${position}. ${rule.file}${globs}${desc}${size}`);
        position++;
      }
      console.log();
    }

    // Token budget warning
    const totalTokens = results.rules.reduce((s, r) => s + r.tokens, 0);
    const alwaysTokens = tiers.always.rules.reduce((s, r) => s + r.tokens, 0);
    console.log('─'.repeat(50));
    console.log(`${CYAN}Total rules:${RESET} ${results.rules.length}`);
    console.log(`${CYAN}Always-active token estimate:${RESET} ~${alwaysTokens} tokens`);
    console.log(`${CYAN}All rules token estimate:${RESET} ~${totalTokens} tokens`);

    if (alwaysTokens > 4000) {
      console.log(`\n${YELLOW}⚠ Your always-active rules use ~${alwaysTokens} tokens.${RESET}`);
      console.log(`${DIM}  Large rule sets eat into your context window. Consider moving some to glob-scoped rules.${RESET}`);
    }

    if (results.warnings.length > 0) {
      console.log();
      for (const w of results.warnings) {
        console.log(`${YELLOW}⚠ ${w}${RESET}`);
      }
    }

    console.log();
    process.exit(0);

  } else if (isGenerate) {
    // Check for --preset flag
    const presetIndex = args.indexOf('--preset');
    const hasPreset = presetIndex !== -1;
    const presetValue = hasPreset ? args[presetIndex + 1] : null;

    // Handle --preset list
    if (hasPreset && presetValue === 'list') {
      console.log(`\n🚀 cursor-lint v${VERSION} --generate --preset list\n`);
      console.log(`${CYAN}Available presets:${RESET}\n`);
      
      const presets = listPresets();
      for (const [key, preset] of Object.entries(presets)) {
        const paddedKey = key.padEnd(12);
        console.log(`  ${GREEN}${paddedKey}${RESET} ${preset.name} — ${DIM}${preset.description}${RESET}`);
      }
      
      console.log(`\n${YELLOW}Usage:${RESET} cursor-lint --generate --preset t3\n`);
      process.exit(0);
    }

    // Handle --preset <name>
    if (hasPreset && presetValue && presetValue !== 'list') {
      console.log(`\n🚀 cursor-lint v${VERSION} --generate --preset ${presetValue}\n`);
      
      const presets = listPresets();
      if (!presets[presetValue]) {
        console.log(`${RED}Unknown preset: ${presetValue}${RESET}\n`);
        console.log(`Run ${CYAN}cursor-lint --generate --preset list${RESET} to see available presets\n`);
        process.exit(1);
      }

      const results = await generateFromPreset(cwd, presetValue);
      
      console.log(`${CYAN}Preset:${RESET} ${results.presetInfo.name}`);
      console.log(`${DIM}${results.presetInfo.description}${RESET}\n`);

      if (results.created.length > 0) {
        console.log(`${GREEN}Downloaded:${RESET}`);
        for (const r of results.created) {
          console.log(`  ${GREEN}✓${RESET} .cursor/rules/${r.file}`);
        }
      }

      if (results.skipped.length > 0) {
        console.log(`\n${YELLOW}Skipped (already exist):${RESET}`);
        for (const r of results.skipped) {
          console.log(`  ${YELLOW}⚠${RESET} .cursor/rules/${r.file}`);
        }
      }

      if (results.failed.length > 0) {
        console.log(`\n${RED}Failed:${RESET}`);
        for (const r of results.failed) {
          console.log(`  ${RED}✗${RESET} ${r.file} — ${r.error}`);
        }
      }

      if (results.created.length > 0) {
        console.log(`\n${DIM}Run cursor-lint to check these rules${RESET}\n`);
      }

      process.exit(results.failed.length > 0 ? 1 : 0);
    }

    // Regular --generate (no preset)
    console.log(`\n🚀 cursor-lint v${VERSION} --generate\n`);
    console.log(`Detecting stack in ${cwd}...\n`);

    const results = await generateRules(cwd);

    if (results.detected.length > 0) {
      console.log(`${CYAN}Detected stack:${RESET} ${results.detected.join(', ')}`);
      
      // Show versions if available
      if (results.versions && Object.keys(results.versions).length > 0) {
        const versionStrs = Object.entries(results.versions).map(([dep, ver]) => `${dep}@${ver}`);
        console.log(`${CYAN}Versions:${RESET} ${versionStrs.join(', ')}`);
      }
      console.log();
    } else {
      console.log(`${YELLOW}No recognized stack detected.${RESET}`);
      console.log(`${DIM}Supports: package.json, tsconfig.json, requirements.txt, pyproject.toml,${RESET}`);
      console.log(`${DIM}Cargo.toml, go.mod, Gemfile, composer.json, pom.xml, build.gradle,${RESET}`);
      console.log(`${DIM}Dockerfile, pubspec.yaml, mix.exs, build.sbt, *.csproj, and more${RESET}\n`);
      process.exit(0);
    }

    const stackCreated = results.created.filter(r => !r.stack.startsWith('best-practice:'));
    const practiceCreated = results.created.filter(r => r.stack.startsWith('best-practice:'));
    const stackSkipped = results.skipped.filter(r => !r.stack.startsWith('best-practice:'));
    const practiceSkipped = results.skipped.filter(r => r.stack.startsWith('best-practice:'));

    if (stackCreated.length > 0) {
      console.log(`${GREEN}Downloaded (stack rules):${RESET}`);
      for (const r of stackCreated) {
        console.log(`  ${GREEN}✓${RESET} .cursor/rules/${r.file} ${DIM}(${r.stack})${RESET}`);
      }
    }

    if (practiceCreated.length > 0) {
      console.log(`\n${GREEN}Downloaded (best practices):${RESET}`);
      for (const r of practiceCreated) {
        const label = r.stack.replace('best-practice: ', '');
        console.log(`  ${GREEN}✓${RESET} .cursor/rules/${r.file} ${DIM}(${label})${RESET}`);
      }
    }

    if (stackSkipped.length + practiceSkipped.length > 0) {
      console.log(`\n${YELLOW}Skipped (already exist):${RESET}`);
      for (const r of [...stackSkipped, ...practiceSkipped]) {
        console.log(`  ${YELLOW}⚠${RESET} .cursor/rules/${r.file}`);
      }
    }

    if (results.fallbacks && results.fallbacks.length > 0) {
      console.log(`\n${YELLOW}Fallbacks (version-specific rule not found):${RESET}`);
      for (const r of results.fallbacks) {
        console.log(`  ${YELLOW}⚠${RESET} ${r.from} → ${r.to} ${DIM}(${r.stack})${RESET}`);
      }
    }

    if (results.failed.length > 0) {
      console.log(`\n${RED}Failed:${RESET}`);
      for (const r of results.failed) {
        console.log(`  ${RED}✗${RESET} ${r.file} — ${r.error}`);
      }
    }

    if (results.created.length > 0) {
      console.log(`\n${DIM}Run cursor-lint to check these rules${RESET}`);
    }

    // Search skills.sh for relevant skills
    if (results.detected.length > 0) {
      console.log(`\n${CYAN}Searching skills.sh for your stack...${RESET}\n`);
      try {
        const skills = await suggestSkills(results.detected);
        if (skills.length > 0) {
          console.log(`${CYAN}Recommended skills from skills.sh:${RESET}`);
          for (const skill of skills) {
            const installs = skill.installs >= 1000
              ? `${(skill.installs / 1000).toFixed(1).replace(/\.0$/, '')}K`
              : `${skill.installs}`;
            console.log(`  ${GREEN}↓${RESET} ${skill.name} ${DIM}(${installs} installs)${RESET}`);
          }
          console.log(`\n${DIM}Install with: npx skills add <source>${RESET}`);
          console.log(`${DIM}Example: npx skills add ${skills[0].source}${RESET}\n`);
        }
      } catch {}
    }

    process.exit(results.failed.length > 0 ? 1 : 0);

  } else if (isFix) {
    console.log(`\n🔧 cursor-lint v${VERSION} --fix\n`);
    console.log(`Scanning ${cwd} for fixable issues...\n`);

    const results = await fixProject(cwd);

    if (results.length === 0) {
      console.log(`${YELLOW}No .mdc files found in .cursor/rules/${RESET}\n`);
      process.exit(0);
    }

    let totalFixed = 0;
    for (const result of results) {
      const relPath = path.relative(cwd, result.file) || result.file;
      if (result.changes.length > 0) {
        console.log(`${GREEN}✓${RESET} ${relPath}`);
        for (const change of result.changes) {
          console.log(`  ${DIM}→ ${change}${RESET}`);
        }
        totalFixed++;
      } else {
        console.log(`${DIM}  ${relPath} — nothing to fix${RESET}`);
      }
    }

    console.log();
    console.log('─'.repeat(50));
    if (totalFixed > 0) {
      console.log(`${GREEN}Fixed ${totalFixed} file(s)${RESET}. Run cursor-lint to verify.\n`);
    } else {
      console.log(`${GREEN}All files look good — nothing to fix${RESET}\n`);
    }
    process.exit(0);

  } else if (isInit) {
    console.log(`\n🔍 cursor-lint v${VERSION} --init\n`);
    console.log(`Detecting stack in ${cwd}...\n`);

    const results = await initProject(cwd);

    const stacks = Object.entries(results.detected)
      .filter(([_, v]) => v)
      .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));

    if (stacks.length > 0) {
      console.log(`Detected: ${stacks.join(', ')}\n`);
    }

    if (results.created.length > 0) {
      console.log(`${GREEN}Created:${RESET}`);
      for (const f of results.created) {
        console.log(`  ${GREEN}✓${RESET} .cursor/rules/${f}`);
      }
    }

    if (results.skipped.length > 0) {
      console.log(`\n${YELLOW}Skipped (already exist):${RESET}`);
      for (const f of results.skipped) {
        console.log(`  ${YELLOW}⚠${RESET} .cursor/rules/${f}`);
      }
    }

    if (results.created.length > 0) {
      console.log(`\n${DIM}Run cursor-lint to check these rules${RESET}`);
      console.log(`${DIM}Run cursor-lint --verify to check code against them${RESET}\n`);
    }

    process.exit(0);

  } else if (isVerify) {
    console.log(`\n🔍 cursor-lint v${VERSION} --verify\n`);
    console.log(`Scanning ${cwd} for rule violations...\n`);

    const results = await verifyProject(cwd);

    if (results.stats.rulesWithVerify === 0) {
      console.log(`${YELLOW}No rules with verify: blocks found.${RESET}`);
      console.log(`${DIM}Add verify: blocks to your .mdc frontmatter to check code compliance.${RESET}`);
      console.log(`${DIM}Run cursor-lint --help for syntax.${RESET}\n`);
      process.exit(0);
    }

    console.log(`Found ${results.stats.rulesWithVerify} rule(s) with verify blocks`);
    console.log(`Checked ${results.stats.filesChecked} file(s)\n`);

    if (results.violations.length === 0) {
      console.log(`${GREEN}✓ No violations found${RESET}\n`);
      process.exit(0);
    }

    // Group violations by file
    const byFile = {};
    for (const v of results.violations) {
      if (!byFile[v.file]) byFile[v.file] = [];
      byFile[v.file].push(v);
    }

    for (const [file, violations] of Object.entries(byFile)) {
      console.log(`${file}`);
      for (const v of violations) {
        const lineInfo = v.line ? ` ${DIM}(line ${v.line})${RESET}` : '';
        console.log(`  ${RED}✗${RESET} ${v.message}${lineInfo}`);
        if (v.match) {
          console.log(`    ${DIM}→ ${v.match}${RESET}`);
        }
      }
      console.log();
    }

    console.log('─'.repeat(50));
    console.log(`${RED}${results.stats.totalViolations} violation(s)${RESET} in ${results.stats.filesWithViolations} file(s)\n`);
    process.exit(1);

  } else {
    // Original lint mode
    const dir = args[0] ? path.resolve(args[0]) : cwd;

    console.log(`\n🔍 cursor-lint v${VERSION}\n`);
    console.log(`Scanning ${dir}...\n`);

    const results = await lintProject(dir);

    let totalErrors = 0;
    let totalWarnings = 0;
    let totalInfo = 0;
    let totalPassed = 0;

    for (const result of results) {
      const relPath = path.relative(dir, result.file) || result.file;
      console.log(relPath);

      if (result.issues.length === 0) {
        console.log(`  ${GREEN}✓ All checks passed${RESET}`);
        totalPassed++;
      } else {
        for (const issue of result.issues) {
          let icon;
          if (issue.severity === 'error') icon = `${RED}✗${RESET}`;
          else if (issue.severity === 'info') icon = `${BLUE}ℹ${RESET}`;
          else icon = `${YELLOW}⚠${RESET}`;
          
          const lineInfo = issue.line ? ` ${DIM}(line ${issue.line})${RESET}` : '';
          console.log(`  ${icon} ${issue.message}${lineInfo}`);
          if (issue.hint) {
            console.log(`    ${DIM}→ ${issue.hint}${RESET}`);
          }
        }
        const errors = result.issues.filter(i => i.severity === 'error').length;
        const warnings = result.issues.filter(i => i.severity === 'warning').length;
        const infos = result.issues.filter(i => i.severity === 'info').length;
        totalErrors += errors;
        totalWarnings += warnings;
        totalInfo += infos;
        if (errors === 0 && warnings === 0 && infos === 0) totalPassed++;
      }
      console.log();
    }

    console.log('─'.repeat(50));
    const parts = [];
    if (totalErrors > 0) parts.push(`${RED}${totalErrors} error${totalErrors !== 1 ? 's' : ''}${RESET}`);
    if (totalWarnings > 0) parts.push(`${YELLOW}${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''}${RESET}`);
    if (totalInfo > 0) parts.push(`${BLUE}${totalInfo} info${RESET}`);
    if (totalPassed > 0) parts.push(`${GREEN}${totalPassed} passed${RESET}`);
    console.log(parts.join(', ') + '\n');

    if (totalErrors > 0) {
      console.log(`${DIM}Try ${CYAN}cursor-lint --fix${RESET}${DIM} to auto-repair frontmatter issues.${RESET}`);
      console.log(`${DIM}Run ${CYAN}cursor-lint --order${RESET}${DIM} to check which rules are actually loading.${RESET}\n`);
    } else if (totalPassed > 0) {
      console.log(`${DIM}If cursor-lint saved you time: ${CYAN}https://github.com/nedcodes-ok/cursor-lint${RESET} ${DIM}(⭐ helps others find it)${RESET}\n`);
    }

    process.exit(totalErrors > 0 ? 1 : 0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
