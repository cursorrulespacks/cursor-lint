const fs = require('fs');
const path = require('path');
const { lintProject } = require('./index');
const { showStats } = require('./stats');

async function doctor(dir) {
  const report = {
    checks: [],
    score: 0,
    maxScore: 0,
    grade: 'F',
  };

  // 1. Check if any rules exist at all
  report.maxScore += 20;
  const rulesDir = path.join(dir, '.cursor', 'rules');
  const hasMdc = fs.existsSync(rulesDir) && fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc')).length > 0;
  const hasCursorrules = fs.existsSync(path.join(dir, '.cursorrules'));
  
  if (hasMdc) {
    report.score += 20;
    report.checks.push({ name: 'Rules exist', status: 'pass', detail: '.cursor/rules/ found with .mdc files' });
  } else if (hasCursorrules) {
    report.score += 5;
    report.checks.push({ name: 'Rules exist', status: 'warn', detail: 'Only .cursorrules found — run --migrate to convert to .mdc format' });
  } else {
    report.checks.push({ name: 'Rules exist', status: 'fail', detail: 'No rules found. Run --init or --generate to create rules.' });
  }

  // 2. Check for .cursorrules (should be migrated)
  report.maxScore += 10;
  if (hasCursorrules && hasMdc) {
    report.score += 5;
    report.checks.push({ name: 'No legacy .cursorrules', status: 'warn', detail: '.cursorrules exists alongside .mdc rules — may cause conflicts. Consider removing it.' });
  } else if (!hasCursorrules) {
    report.score += 10;
    report.checks.push({ name: 'No legacy .cursorrules', status: 'pass', detail: 'Good — using modern .mdc format only' });
  } else {
    report.checks.push({ name: 'No legacy .cursorrules', status: 'warn', detail: 'Using legacy .cursorrules — run --migrate to convert' });
  }

  // 3. Run lint checks and count issues
  report.maxScore += 30;
  const lintResults = await lintProject(dir);
  let errors = 0;
  let warnings = 0;
  for (const r of lintResults) {
    for (const i of r.issues) {
      if (i.severity === 'error') errors++;
      else if (i.severity === 'warning') warnings++;
    }
  }
  
  if (errors === 0 && warnings === 0) {
    report.score += 30;
    report.checks.push({ name: 'Lint checks', status: 'pass', detail: 'All rules pass lint checks' });
  } else if (errors === 0) {
    report.score += 20;
    report.checks.push({ name: 'Lint checks', status: 'warn', detail: `${warnings} warning${warnings !== 1 ? 's' : ''} found. Run cursor-lint to see details.` });
  } else {
    report.score += Math.max(0, 10 - errors * 2);
    report.checks.push({ name: 'Lint checks', status: 'fail', detail: `${errors} error${errors !== 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''}. Run cursor-lint to fix.` });
  }

  // 4. Token budget check
  report.maxScore += 15;
  const stats = showStats(dir);
  if (stats.totalTokens === 0) {
    report.checks.push({ name: 'Token budget', status: 'info', detail: 'No rules to measure' });
  } else if (stats.totalTokens < 2000) {
    report.score += 15;
    report.checks.push({ name: 'Token budget', status: 'pass', detail: `~${stats.totalTokens} tokens — well within budget` });
  } else if (stats.totalTokens < 5000) {
    report.score += 10;
    report.checks.push({ name: 'Token budget', status: 'warn', detail: `~${stats.totalTokens} tokens — getting heavy. Consider trimming or splitting rules.` });
  } else {
    report.score += 5;
    report.checks.push({ name: 'Token budget', status: 'fail', detail: `~${stats.totalTokens} tokens — very heavy. This eats into your context window every request.` });
  }

  // 5. Coverage gaps
  report.maxScore += 15;
  if (stats.coverageGaps.length === 0) {
    report.score += 15;
    report.checks.push({ name: 'Coverage', status: 'pass', detail: 'Rules cover your project file types' });
  } else if (stats.coverageGaps.length <= 2) {
    report.score += 10;
    const gaps = stats.coverageGaps.map(g => g.ext).join(', ');
    report.checks.push({ name: 'Coverage', status: 'warn', detail: `Missing rules for: ${gaps}. Run --generate to add them.` });
  } else {
    report.score += 5;
    const gaps = stats.coverageGaps.map(g => g.ext).join(', ');
    report.checks.push({ name: 'Coverage', status: 'fail', detail: `Missing rules for: ${gaps}. Run --generate to add them.` });
  }

  // 6. Skills check
  report.maxScore += 10;
  const skillDirs = [
    path.join(dir, '.claude', 'skills'),
    path.join(dir, '.cursor', 'skills'),
    path.join(dir, 'skills'),
  ];
  const hasSkills = skillDirs.some(sd => {
    if (!fs.existsSync(sd)) return false;
    try {
      return fs.readdirSync(sd).some(e => {
        const sub = path.join(sd, e);
        return fs.statSync(sub).isDirectory() && fs.existsSync(path.join(sub, 'SKILL.md'));
      });
    } catch { return false; }
  });
  
  if (hasSkills) {
    report.score += 10;
    report.checks.push({ name: 'Agent skills', status: 'pass', detail: 'Skills directory found' });
  } else {
    report.score += 5; // not having skills is fine, just not optimal
    report.checks.push({ name: 'Agent skills', status: 'info', detail: 'No agent skills found. Skills are optional but can improve agent behavior for complex workflows.' });
  }

  // Calculate grade
  const pct = (report.score / report.maxScore) * 100;
  if (pct >= 90) report.grade = 'A';
  else if (pct >= 75) report.grade = 'B';
  else if (pct >= 60) report.grade = 'C';
  else if (pct >= 40) report.grade = 'D';
  else report.grade = 'F';
  
  report.percentage = Math.round(pct);

  return report;
}

module.exports = { doctor };
