/**
 * Moteur d'audit unifié pour le Security Dashboard.
 */

import { isPasswordPwned } from './hibp-service.js';
import { classifyFinding, getEntrySeverity, sortBySeverity, SEVERITY } from './severity.js';
import { categorizePasswordAge } from '../utils/password-age.js';
import { getPasswordEntropy } from './audit.js';
import { groupPasswordReuse } from './password-reuse-groups.js';

function analyzeLocal(entries = []) {
  const counts = new Map();

  for (const entry of entries) {
    const pwd = entry.password || '';
    counts.set(pwd, (counts.get(pwd) || 0) + 1);
  }

  return entries.map((entry) => ({
    entry,
    reuseCount: counts.get(entry.password || '') || 1,
    hibp: null
  }));
}

async function analyzeHibpBatched(analysis, concurrency = 5) {
  const queue = [...analysis];
  const running = new Set();

  for (const item of queue) {
    const promise = isPasswordPwned(item.entry.password || '').then((result) => {
      item.hibp = result;
      running.delete(promise);
    });

    running.add(promise);
    if (running.size >= concurrency) {
      await Promise.race(running);
    }
  }

  await Promise.all(running);
}

export async function auditSecurityDashboard(entries = [], options = {}) {
  const { checkHibp = false, hibpConcurrency = 5 } = options;

  const report = {
    summary: {
      total: entries.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      pwned: 0,
      old: 0,
      weak: 0,
      reused: 0
    },
    vulnerabilities: [],
    weakPasswords: [],
    reuseGroups: [],
    recommendations: [],
    raw: []
  };

  if (!entries.length) return report;

  const analysis = analyzeLocal(entries);
  report.reuseGroups = groupPasswordReuse(entries);
  report.summary.reused = report.reuseGroups.reduce((total, group) => total + group.entries.length, 0);

  if (checkHibp) {
    await analyzeHibpBatched(analysis, hibpConcurrency);
  }

  for (const item of analysis) {
    const findings = [];

    if (item.hibp?.pwned) {
      findings.push(classifyFinding('pwned', { count: item.hibp.count }));
      report.summary.pwned++;
    }

    const age = categorizePasswordAge(item.entry);
    if (age.category === 'critical') {
      findings.push(classifyFinding('old_2years', { days: age.days }));
      report.summary.old++;
    } else if (age.category === 'old') {
      findings.push(classifyFinding('old_1year', { days: age.days }));
      report.summary.old++;
    }

    const entropy = getPasswordEntropy(item.entry.password || '');
    if (entropy < 40) {
      findings.push(classifyFinding('weak_critical', { entropy }));
      report.summary.weak++;
    } else if (entropy < 60) {
      findings.push(classifyFinding('weak', { entropy }));
      report.summary.weak++;
    }

    if (item.reuseCount > 1) {
      findings.push(classifyFinding('reused', { count: item.reuseCount }));
    }

    const severity = getEntrySeverity(findings);

    if (severity.level === SEVERITY.CRITICAL.level) report.summary.critical++;
    else if (severity.level === SEVERITY.HIGH.level) report.summary.high++;
    else if (severity.level === SEVERITY.MEDIUM.level) report.summary.medium++;
    else report.summary.low++;

    const enriched = {
      entry: item.entry,
      findings,
      severity,
      age,
      entropy,
      hibp: item.hibp
    };

    report.raw.push(enriched);

    if (severity.level >= SEVERITY.HIGH.level) {
      report.vulnerabilities.push(enriched);
    }

    if (findings.some((f) => f.type.includes('weak'))) {
      report.weakPasswords.push(enriched);
    }

    if (findings.length && severity.level >= SEVERITY.MEDIUM.level) {
      const [primary] = findings.sort((a, b) => b.weight - a.weight);
      report.recommendations.push({
        entry: item.entry,
        priority: severity,
        action: primary.recommendation,
        details: findings.map((f) => f.description).join('; ')
      });
    }
  }

  report.vulnerabilities = sortBySeverity(report.vulnerabilities);
  report.weakPasswords = sortBySeverity(report.weakPasswords);
  report.recommendations.sort((a, b) => b.priority.level - a.priority.level);

  return report;
}
