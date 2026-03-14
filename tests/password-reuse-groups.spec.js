import { groupPasswordReuse, getReuseGroupEntries } from '../scripts/security/password-reuse-groups.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const entries = [
  { id: '1', title: 'Mail', password: 'SamePass!123', username: 'a' },
  { id: '2', title: 'Bank', password: 'SamePass!123', username: 'b' },
  { id: '3', title: 'Cloud', password: 'Unique!456', username: 'c' }
];

const groups = groupPasswordReuse(entries);
assert(groups.length === 1, 'Un seul groupe de réutilisation attendu.');
assert(groups[0].entries.length === 2, 'Le groupe doit contenir 2 entrées.');
assert(!groups[0].entries.some((entry) => Object.hasOwn(entry, 'password')), 'Le mot de passe ne doit pas apparaître dans les métadonnées de groupe.');

const resolved = getReuseGroupEntries(groups[0].hashId, entries);
assert(resolved.length === 2, 'La résolution d’un groupe doit retourner les entrées complètes.');
assert(resolved.every((entry) => entry.password === 'SamePass!123'), 'La résolution doit conserver les mots de passe originaux pour édition.');

console.log('✅ Password reuse grouping checks passed.');
