/**
 * CryptoKeep - Politique de solidite des mots de passe (Lot 5).
 *
 * POURQUOI CE MODULE EXISTE
 * L'estimateur historique, `estimatePasswordEntropyBits`, calcule
 * `longueur x log2(taille de l'alphabet)`. Cette formule suppose que chaque
 * caractere est tire au hasard dans son alphabet. Elle SURESTIME donc
 * massivement toute chaine previsible :
 *
 *   'abababababab'      -> 56 bits annonces, alors qu'il s'agit de « ab » x 6
 *   'passwordpassword'  -> 75 bits annonces, alors qu'il s'agit d'un mot
 *                          courant repete deux fois
 *   'azertyuiop'        -> 47 bits annonces, alors qu'il s'agit d'une rangee
 *                          de clavier lue de gauche a droite
 *   'P@ssw0rd123'       -> 72 bits annonces, alors qu'il s'agit d'un mot
 *                          courant, d'une substitution triviale et d'un
 *                          suffixe numerique previsible
 *
 * CE MODULE ne remplace pas l'estimateur : il le CONSERVE comme mesure
 * brute et lui applique des penalites motivees, chacune nommee et
 * explicable. Il vit dans la couche metier : `master-password-policy.js`
 * s'en sert pour DECIDER, l'interface pour AFFICHER. Aucun appel reseau,
 * aucune persistance, aucune journalisation.
 *
 * CE QU'IL FAVORISE
 * Une phrase de passe longue vaut mieux qu'une chaine courte bourree de
 * symboles. Ce module n'exige donc PAS la presence de toutes les classes de
 * caracteres : une phrase de plusieurs mots distincts et suffisamment longue
 * est acceptee telle quelle. La diversite de caracteres n'est qu'un des
 * chemins vers un bon score, jamais une condition.
 *
 * CE QU'IL N'EST PAS
 * Ce n'est pas un estimateur de cout d'attaque. Les penalites sont des
 * bornes SUPERIEURES prudentes, pas une mesure exacte de la resistance
 * reelle. Un mot de passe juge « solide » ici peut toujours figurer dans une
 * fuite : c'est le role, distinct et optionnel, de la verification HIBP.
 */

import { estimatePasswordEntropyBits } from '../ui/password-meter/password-meter.js';

/**
 * Mots et motifs courants, en minuscules et sans accents.
 *
 * Liste volontairement COURTE et embarquee : aucun telechargement, aucune
 * dependance. Elle ne pretend pas etre exhaustive — c'est precisement ce que
 * la verification HIBP optionnelle apporte en complement.
 */
export const COMMON_PASSWORDS = Object.freeze([
  'password', 'motdepasse', 'passwd', 'admin', 'administrateur', 'root',
  'welcome', 'bienvenue', 'letmein', 'login', 'user', 'utilisateur',
  'qwerty', 'azerty', 'qwertz', 'iloveyou', 'monkey', 'dragon', 'sunshine',
  'princess', 'football', 'baseball', 'soleil', 'bonjour', 'salut',
  'secret', 'master', 'maitre', 'coffre', 'vault', 'cryptokeep',
  'abc', 'test', 'demo', 'default', 'changeme', 'temp', 'guest', 'invite',
  'azertyuiop', 'qwertyuiop', 'motdepasse123', 'password123'
]);

/** Rangees et colonnes de clavier, AZERTY et QWERTY. */
const KEYBOARD_ROWS = Object.freeze([
  'azertyuiop', 'qsdfghjklm', 'wxcvbn',
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  '1234567890', '&"\'(-_)=',
  'aqwzsx', 'zsxedc', 'edcrfv', 'rfvtgb', 'tgbyhn', 'yhnujk'
]);

/** Substitutions « leet » les plus banales. */
const LEET_MAP = Object.freeze({
  '@': 'a', '4': 'a', '8': 'b', '(': 'c', '3': 'e', '6': 'g',
  '1': 'l', '!': 'i', '0': 'o', '5': 's', '$': 's', '7': 't', '+': 't'
});

/** Retire accents et diacritiques, puis passe en minuscules. */
function normalize(value) {
  return String(value).normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
}

/** Applique les substitutions leet, pour reconnaitre `P@ssw0rd` = `password`. */
function unleet(value) {
  let out = '';
  for (const character of value) {
    const replacement = Object.prototype.hasOwnProperty.call(LEET_MAP, character)
      ? Object.entries(LEET_MAP).find(([key]) => key === character)[1]
      : character;
    out += replacement;
  }
  return out;
}

// ===========================================================================
// Detecteurs. Chacun renvoie soit `null`, soit une penalite nommee.
// Une penalite est un FACTEUR multiplicatif applique aux bits bruts, borne
// entre 0 et 1, accompagne d'un code et d'un libelle explicable.
// ===========================================================================

/** Plus longue repetition d'un motif : `abababab` = « ab » x 4. */
function longestRepeatedUnit(value) {
  const length = value.length;
  if (length < 4) return null;

  // Analyse LINEAIRE en taille de motif : aucune expression reguliere a
  // quantificateurs imbriques, donc aucun risque de retour arriere.
  for (let unit = 1; unit <= Math.floor(length / 2); unit += 1) {
    if (length % unit !== 0) continue;
    const motif = value.slice(0, unit);
    let identique = true;
    for (let index = unit; index < length; index += unit) {
      if (value.slice(index, index + unit) !== motif) { identique = false; break; }
    }
    if (identique) return { motif, repetitions: length / unit };
  }
  return null;
}

/** Decoupe une chaine en suites de caracteres identiques. */
function runLengths(value) {
  const suites = [];
  let courante = null;

  for (const caractere of value) {
    if (courante && courante.character === caractere) courante.length += 1;
    else {
      courante = { character: caractere, length: 1 };
      suites.push(courante);
    }
  }
  return suites;
}

/**
 * Plus longue suite d'un MEME caractere, ou qu'elle se trouve dans la chaine.
 *
 * LOT 7B - DEFAUT CORRIGE. `detectRepetition` ne reconnaissait que les
 * repetitions couvrant la chaine ENTIERE. Une longue suite noyee dans une
 * chaine passait donc intacte, et l'estimateur naif s'appliquait sans
 * penalite :
 *
 *   'aaaaaaaaaaaaZ9!'  -> 98 bits annonces, ACCEPTE
 *   '111111111111Aa!'  -> 98 bits annonces, ACCEPTE
 *   'Xaaaaaaaaaaaaaaaa' -> 96 bits annonces, ACCEPTE
 *
 * Une suite de n caracteres identiques ne vaut qu'un caractere, plus la
 * connaissance de sa longueur. La longueur EFFECTIVE de la chaine est donc
 * reduite de (n - 1).
 */
function detectCharacterRun(normalized) {
  const suites = runLengths(normalized);
  const plusLongue = suites.reduce(
    (max, suite) => (suite.length > max.length ? suite : max),
    { character: '', length: 0 }
  );

  if (plusLongue.length < 4) return null;

  // TOUTES les suites d'au moins 3 caracteres sont deduites, pas seulement la
  // plus longue : « aaaaaaaaaa-bbbbbbbbbb-cccccccccc-dddddddddd » en contient
  // quatre, et n'en retenir qu'une laissait la chaine paraitre longue.
  const economie = suites
    .filter((suite) => suite.length >= 3)
    .reduce((total, suite) => total + (suite.length - 1), 0);

  const longueurEffective = Math.max(1, normalized.length - economie);
  const total = suites.filter((suite) => suite.length >= 3).length;

  return {
    code: 'character_run',
    label: total > 1
      ? `${total} suites d'un meme caractere, la plus longue « ${plusLongue.character} » x${plusLongue.length}`
      : `« ${plusLongue.character} » repete ${plusLongue.length} fois de suite`,
    factor: longueurEffective / normalized.length
  };
}

/**
 * Plus long fragment REPETE, meme s'il ne couvre pas toute la chaine.
 *
 * Complete `detectRepetition` : `abcabcabcXYZ` n'est pas une repetition
 * complete, mais les deux tiers de la chaine sont deja connus des le premier
 * `abc`. L'analyse est bornee : longueur de motif limitee a la moitie de la
 * chaine, et chaine elle-meme bornee, donc aucun risque de cout quadratique
 * incontrole.
 */
function detectRepeatedBlock(normalized) {
  const longueur = normalized.length;
  if (longueur < 8 || longueur > 512) return null;

  let meilleur = '';
  const maxMotif = Math.floor(longueur / 2);

  for (let taille = maxMotif; taille >= 3; taille -= 1) {
    for (let depart = 0; depart + taille * 2 <= longueur; depart += 1) {
      const motif = normalized.slice(depart, depart + taille);
      if (normalized.indexOf(motif, depart + taille) !== -1) {
        meilleur = motif;
        break;
      }
    }
    if (meilleur) break;
  }

  if (!meilleur) return null;

  // Couverture totale du motif dans la chaine.
  let occurrences = 0;
  let position = normalized.indexOf(meilleur);
  while (position !== -1) {
    occurrences += 1;
    position = normalized.indexOf(meilleur, position + meilleur.length);
  }

  const couverture = (occurrences * meilleur.length) / longueur;
  if (couverture < 0.4) return null;

  // Les occurrences apres la premiere n'apportent rien.
  const longueurEffective = longueur - (occurrences - 1) * meilleur.length;
  return {
    code: 'repeated_block',
    label: `Fragment « ${meilleur} » repete ${occurrences} fois`,
    factor: Math.max(0.05, longueurEffective / longueur)
  };
}

/** Repetition d'un motif : `aaaa`, `abababab`, `passwordpassword`. */
function detectRepetition(normalized) {
  const repeated = longestRepeatedUnit(normalized);
  if (!repeated || repeated.repetitions < 2) return null;

  // La chaine ne vaut pas plus que son motif : le facteur est le rapport
  // entre la longueur du motif et la longueur totale.
  return {
    code: 'repetition',
    label: `Motif « ${repeated.motif} » repete ${repeated.repetitions} fois`,
    factor: repeated.motif.length / normalized.length
  };
}

/** Plus longue sequence croissante ou decroissante de codes voisins. */
function longestRunLength(value) {
  let best = 1;
  let current = 1;
  let direction = 0;

  for (let index = 1; index < value.length; index += 1) {
    const delta = value.charCodeAt(index) - value.charCodeAt(index - 1);
    if ((delta === 1 || delta === -1) && (direction === 0 || direction === delta)) {
      direction = delta;
      current += 1;
    } else if (delta === 1 || delta === -1) {
      direction = delta;
      current = 2;
    } else {
      direction = 0;
      current = 1;
    }
    if (current > best) best = current;
  }
  return best;
}

/** Sequences alphabetiques et numeriques : `abcdef`, `123456`, `9876`. */
function detectSequence(normalized) {
  const run = longestRunLength(normalized);
  if (run < 4) return null;

  // Une sequence de n caracteres ne vaut qu'un choix de depart et un sens.
  return {
    code: 'sequence',
    label: `Sequence de ${run} caracteres consecutifs`,
    factor: Math.max(0.15, 1 - (run / normalized.length) * 0.9)
  };
}

/** Motifs clavier : `azerty`, `qwertyui`, `aqwzsx`. */
function detectKeyboardPattern(normalized) {
  let best = 0;
  let source = '';

  for (const row of KEYBOARD_ROWS) {
    const inverse = [...row].reverse().join('');
    for (const reference of [row, inverse]) {
      for (let start = 0; start < reference.length; start += 1) {
        for (let end = reference.length; end > start + 3; end -= 1) {
          const fragment = reference.slice(start, end);
          if (fragment.length > best && normalized.includes(fragment)) {
            best = fragment.length;
            source = fragment;
          }
        }
      }
    }
  }

  if (best < 4) return null;
  return {
    code: 'keyboard',
    label: `Motif clavier « ${source} » (${best} touches voisines)`,
    factor: Math.max(0.15, 1 - (best / normalized.length) * 0.9)
  };
}

/** Mot courant present dans la chaine, leet compris. */
function detectCommonWord(normalized) {
  const deleeted = unleet(normalized);
  let found = null;

  for (const common of COMMON_PASSWORDS) {
    if (common.length < 3) continue;
    if (normalized.includes(common) || deleeted.includes(common)) {
      if (!found || common.length > found.length) found = common;
    }
  }
  if (!found) return null;

  const couvert = found.length / normalized.length;
  // Une chaine QUI EST un mot courant ne vaut presque rien ; un mot courant
  // noye dans une longue phrase pese beaucoup moins.
  return {
    code: 'common_word',
    label: couvert >= 0.9
      ? `« ${found} » est un mot de passe courant`
      : `Contient le mot courant « ${found} »`,
    factor: Math.max(0.05, 1 - couvert * 0.95)
  };
}

/**
 * Variante triviale : mot courant plus un suffixe previsible.
 * `password123`, `Azerty2024!`, `admin!`.
 */
function detectTrivialVariant(normalized) {
  // L'ordre compte : le suffixe est retire de la chaine D'ORIGINE, puis le
  // radical est « deleete ». Deleeter d'abord transformerait les chiffres du
  // suffixe ('password123' -> 'passwordl2e') et empecherait de le reconnaitre.
  const sansSuffixe = normalized.replace(/[0-9]{0,4}[!?.*_-]{0,3}$/u, '');
  if (sansSuffixe === normalized) return null;
  if (sansSuffixe.length < 3) return null;

  const radical = unleet(sansSuffixe);
  const estCourant = COMMON_PASSWORDS.some(
    (common) => sansSuffixe === common || radical === common
  );
  if (!estCourant) return null;

  return {
    code: 'trivial_variant',
    label: 'Mot courant suivi d\'un suffixe previsible',
    factor: 0.1
  };
}

/** Repetition d'un MOT dans une phrase : « cheval cheval cheval ». */
function detectRepeatedWords(normalized) {
  const mots = normalized.split(/[^a-z0-9]+/u).filter((mot) => mot.length >= 2);
  if (mots.length < 2) return null;

  const uniques = new Set(mots);
  if (uniques.size === mots.length) return null;

  return {
    code: 'repeated_words',
    label: `${mots.length} mots dont seulement ${uniques.size} distincts`,
    factor: uniques.size / mots.length
  };
}

/** Tous les detecteurs, dans un ordre stable. */
const DETECTORS = Object.freeze([
  detectCommonWord,
  detectTrivialVariant,
  detectRepetition,
  detectCharacterRun,
  detectRepeatedBlock,
  detectRepeatedWords,
  detectSequence,
  detectKeyboardPattern
]);

/**
 * Nombre de MOTS distincts d'au moins 3 caracteres.
 *
 * Sert a reconnaitre une phrase de passe. Une phrase de plusieurs mots
 * distincts est un bon mot de passe meme sans chiffre ni symbole : c'est
 * exactement ce que la politique doit favoriser.
 */
export function countDistinctWords(password) {
  const mots = normalize(password).split(/[^a-z0-9]+/u).filter((mot) => mot.length >= 3);
  return new Set(mots).size;
}

/** Seuils de la politique. Exportes pour que les tests ne les devinent pas. */
export const POLICY = Object.freeze({
  minLength: 12,
  minEffectiveBits: 50,
  // Une phrase d'au moins ce nombre de mots DISTINCTS et de cette longueur
  // est acceptee sans exigence de classes de caracteres.
  passphraseMinWords: 4,
  passphraseMinLength: 20,
  passphraseBonusBits: 8
});

/**
 * Analyse complete d'un mot de passe.
 *
 * @param {string} password
 * @returns {{
 *   naiveBits: number, effectiveBits: number, penalties: Array,
 *   isPassphrase: boolean, distinctWords: number, length: number,
 *   score: number
 * }}
 */
export function analyzePassword(password) {
  const value = typeof password === 'string' ? password : '';
  const naiveBits = estimatePasswordEntropyBits(value);

  if (value.length === 0) {
    return {
      naiveBits: 0,
      effectiveBits: 0,
      penalties: [],
      isPassphrase: false,
      distinctWords: 0,
      length: 0,
      score: 0
    };
  }

  const normalized = normalize(value);
  const penalties = [];
  let factor = 1;

  for (const detector of DETECTORS) {
    const penalty = detector(normalized);
    if (!penalty) continue;
    penalties.push(penalty);
    // Les penalites se COMBINENT : une chaine a la fois courante et repetee
    // est plus faible que chacun des deux defauts pris isolement.
    factor *= Math.max(0, Math.min(1, penalty.factor));
  }

  const distinctWords = countDistinctWords(value);
  // LOT 7B : une phrase dont un motif previsible a ete detecte n'est pas une
  // phrase de passe. « aaaaaaaaaa-bbbbbbbbbb-cccccccccc-dddddddddd » comptait
  // quatre « mots » distincts et recevait le bonus.
  const isPassphrase = distinctWords >= POLICY.passphraseMinWords
    && value.length >= POLICY.passphraseMinLength
    && penalties.length === 0;

  // Bonus de phrase de passe : une phrase longue et variee resiste bien, sans
  // qu'aucune classe de caracteres ne soit imposee.
  const bonus = isPassphrase ? POLICY.passphraseBonusBits : 0;

  // Le plafond par alphabet observe s'applique AVANT les penalites : il
  // corrige l'estimation de depart, il ne la sanctionne pas.
  const plafond = observedAlphabetCeiling(value);
  const bitsDeDepart = plafond === null ? naiveBits : Math.min(naiveBits, plafond);

  const effectiveBits = Math.max(0, Math.floor(bitsDeDepart * factor) + bonus);

  return {
    naiveBits,
    effectiveBits,
    penalties,
    isPassphrase,
    distinctWords,
    length: value.length,
    score: bitsToScore(effectiveBits)
  };
}

/**
 * Plafond fonde sur l'alphabet REELLEMENT observe.
 *
 * LOT 7B - CAUSE RACINE. L'estimateur naif multiplie la longueur par le
 * logarithme de l'alphabet THEORIQUE : des qu'une majuscule, un chiffre et
 * un symbole apparaissent, il suppose 95 caracteres possibles a chaque
 * position. Une chaine faite de quatre caracteres distincts repetes quinze
 * fois obtient ainsi 98 bits.
 *
 * Quand une chaine est LONGUE par rapport au nombre de caracteres distincts
 * qu'elle contient, cette repetition est une donnee observable : l'alphabet
 * reellement employe est petit. Un plafond est alors calcule sur cet
 * alphabet observe.
 *
 * LA GARDE EST ESSENTIELLE. Un mot de passe aleatoire COURT ne montre que
 * peu de caracteres distincts sans que cela signifie quoi que ce soit :
 * 13 caracteres tires au hasard en affichent 13. Le plafond ne s'applique
 * donc QUE si la longueur atteint le double du nombre de caracteres
 * distincts — c'est-a-dire si les caracteres se repetent vraiment.
 *
 * @returns {number|null} plafond en bits, ou `null` si la garde ne passe pas
 */
export function observedAlphabetCeiling(value) {
  const distincts = new Set(Array.from(value)).size;
  if (distincts === 0) return 0;
  if (value.length < distincts * 2) return null;

  // La longueur retenue est la longueur COMPRESSEE, et non la longueur brute :
  // une suite de dix caracteres identiques ne represente pas dix choix, mais
  // un choix et une longueur. Sans cela, une chaine faite de quatre longues
  // suites paraissait encore riche.
  const suites = runLengths(value);
  const longueurCompressee = suites.reduce(
    (total, suite) => total + 1 + (suite.length > 1 ? Math.ceil(Math.log2(suite.length)) : 0),
    0
  );

  // `Math.max(distincts, 2)` : un alphabet d'un seul caractere donnerait
  // log2(1) = 0 et effacerait toute nuance.
  return Math.floor(longueurCompressee * Math.log2(Math.max(distincts, 2)));
}

/** Score 0 a 4, sur les bits EFFECTIFS. Memes paliers que l'affichage. */
export function bitsToScore(bits) {
  if (bits < 30) return 0;
  if (bits < 45) return 1;
  if (bits < 60) return 2;
  if (bits < 80) return 3;
  return 4;
}

/**
 * Decision de politique pour un mot de passe MAITRE.
 *
 * @returns {{valid: boolean, message?: string, analysis: object}}
 */
export function evaluateMasterPasswordPolicy(password) {
  const analysis = analyzePassword(password);

  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, message: 'Le mot de passe maitre est requis.', analysis };
  }

  if (password.length < POLICY.minLength) {
    return {
      valid: false,
      message: `Le mot de passe maitre doit contenir au moins ${POLICY.minLength} caracteres.`,
      analysis
    };
  }

  // Une phrase de passe longue et variee suffit : aucune classe de
  // caracteres n'est exigee en plus.
  if (analysis.isPassphrase && analysis.effectiveBits >= POLICY.minEffectiveBits) {
    return { valid: true, analysis };
  }

  if (analysis.effectiveBits < POLICY.minEffectiveBits) {
    // Le message NOMME le motif detecte : un refus doit etre actionnable.
    const principale = analysis.penalties.length > 0
      ? analysis.penalties.reduce((pire, actuelle) => (actuelle.factor < pire.factor ? actuelle : pire))
      : null;

    const explication = principale
      ? ` Motif detecte : ${principale.label}.`
      : '';

    return {
      valid: false,
      message: `Le mot de passe maitre est trop previsible.${explication}`
        + ' Une phrase de passe longue, faite de plusieurs mots distincts, est preferable.',
      analysis
    };
  }

  return { valid: true, analysis };
}

export default {
  analyzePassword,
  evaluateMasterPasswordPolicy,
  bitsToScore,
  countDistinctWords,
  COMMON_PASSWORDS,
  POLICY
};
