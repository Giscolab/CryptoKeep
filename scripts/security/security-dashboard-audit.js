/**
 * Moteur d'audit unifié pour le Security Dashboard.
 */

import { isPasswordPwned } from './hibp-service.js';
import { classifyFinding, getEntrySeverity, sortBySeverity, SEVERITY } from './severity.js';
import { categorizePasswordAge } from '../utils/password-age.js';
import { getPasswordEntropy } from './audit.js?v=20260719-1';
// LOT 5 : la decision de reutilisation passe par la comparaison EXACTE des
// chaines. `password-reuse-groups.js` reste present, mais son condensat
// maison de 32 bits confondait des mots de passe differents ('Aa' et 'BB').
import { analyzeReuse } from './password-reuse.js';

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
  // LOT 5 : l'etat de la verification de compromission est REMONTE au
  // rapport. Sans lui, l'interface ne pourrait pas distinguer « aucune fuite
  // trouvee » de « aucune fuite recherchee », et afficherait un resultat
  // rassurant sans avoir rien analyse.

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
  report.reuseGroups = await analyzeReuse(entries);
  report.summary.reused = report.reuseGroups.reduce((total, group) => total + group.entries.length, 0);

  if (checkHibp) {
    await analyzeHibpBatched(analysis, hibpConcurrency);
  }

  const verifies = analysis.filter((item) => item.hibp?.checked === true).length;
  report.breachCheck = {
    requested: checkHibp === true,
    checkedCount: verifies,
    totalCount: analysis.length,
    // `complete` n'est vrai que si CHAQUE entree a reellement recu une
    // reponse. Un audit partiel ne doit jamais se presenter comme complet.
    complete: checkHibp === true && analysis.length > 0 && verifies === analysis.length,
    reasons: Array.from(new Set(
      analysis
        .filter((item) => item.hibp && item.hibp.checked !== true)
        .map((item) => item.hibp.reason)
    ))
  };

  for (const item of analysis) {
    const findings = [];

    // LOT 5 : une fuite n'est declaree que si une verification a REELLEMENT
    // eu lieu. `pwned` vaut `null` quand rien n'a pu etre verifie ; ce n'est
    // ni une fuite, ni une absence de fuite.
    if (item.hibp?.checked === true && item.hibp.pwned === true) {
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
