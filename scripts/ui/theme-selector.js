/**
 * CryptoKeep - Selecteur de theme.
 *
 * LOT 7C - DEFAUT CORRIGE (meme classe que celui des reglages : ce qui est
 * AFFICHE devait diverger de ce qui est APPLIQUE).
 *
 * `initThemeSelector` lisait `selectedTheme` dans le stockage, le passait a
 * `applyTheme` — qui le ramenait silencieusement a « default » s il n etait
 * pas dans la liste blanche — puis reaffectait au menu deroulant la valeur
 * BRUTE, c est-a-dire la valeur refusee :
 *
 *   valeur en stockage : "sith-maison"   (non autorisee)
 *   theme applique     : "default"
 *   menu affiche       : "sith-maison"
 *
 * L utilisateur voyait donc un theme selectionne qui n etait pas celui en
 * vigueur, et le fait de rouvrir le panneau ne corrigeait rien.
 *
 * `applyTheme` renvoie desormais le theme REELLEMENT applique, et c est cette
 * valeur — et elle seule — qui est affichee. L acces au stockage est de plus
 * protege : un stockage indisponible ne doit pas empecher l application d un
 * theme, ni faire croire qu il a ete memorise.
 */

const allowedThemes = [
  "default",
  "deathstar",
  "flatdark",
  "galactic",
  "invaders",
  "leia",
  "lightsaber",
  "metallic",
  "millennium",
  "padawan",
  "r2d2",
  "sith",
  "starfighter",
  "ubuntu",
  "xwing"
];

const applyTheme = (theme) => {
  const linkId = "theme-css";
  let link = document.getElementById(linkId);

  // Sécurisation : vérifie si le thème est autorisé.
  //
  // CodeQL signalait « DOM text reinterpreted as HTML » sur la construction de
  // `link.href` plus bas : la valeur vient de `localStorage`, donc d'une source
  // que l'analyse considère comme contrôlable. Le contrôle ci-dessous la
  // bornait déjà à quinze littéraux, mais la garde et le point d'écriture sont
  // séparés par une vingtaine de lignes — une modification future pouvait les
  // désolidariser sans que rien ne le signale.
  //
  // La valeur retenue est désormais prise DANS la liste blanche elle-même, et
  // non recopiée depuis l'entrée. Ce qui atteint `href` provient donc toujours
  // d'une constante du fichier, jamais d'une chaîne extérieure.
  const themeAutorise = allowedThemes.find((autorise) => autorise === theme);
  if (!themeAutorise) {
    console.warn(`Thème non autorisé : "${theme}"`);
  }
  theme = themeAutorise || "default";

  // Met à jour l'attribut data-theme
  document.documentElement.setAttribute("data-theme", theme);

  // Si c'est le thème par défaut, pas besoin de fichier externe
  if (theme === "default") {
    if (link) link.disabled = true;
  } else {
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `public/themes/${theme}.css`;
    link.disabled = false;
  }

  // Sauvegarde le thème. Un refus d'écriture (quota, mode restreint,
  // stockage désactivé) ne doit pas empêcher l'application du thème : le
  // thème reste actif pour la session, il n'est simplement pas mémorisé.
  try {
    localStorage.setItem("selectedTheme", theme);
  } catch {
    // Volontairement silencieux : rien de sensible, rien à journaliser.
  }

  // Le theme REELLEMENT applique est renvoye a l'appelant, qui est le seul
  // a pouvoir remettre l'interface d'accord avec lui.
  return theme;
};

export function initThemeSelector() {
  let savedTheme = "default";
  try {
    savedTheme = localStorage.getItem("selectedTheme") || "default";
  } catch {
    savedTheme = "default";
  }

  // On affiche le theme APPLIQUE, jamais celui demande.
  const themeApplique = applyTheme(savedTheme);

  const themeSelect = document.getElementById("theme-select");
  if (themeSelect) {
    themeSelect.value = themeApplique;
    themeSelect.addEventListener("change", (e) => {
      const demande = e && e.target ? e.target.value : themeSelect.value;
      const reel = applyTheme(demande);
      // Si le theme demande a ete refuse par la liste blanche, le menu revient
      // sur le theme en vigueur au lieu de conserver un choix sans effet.
      if (String(reel) !== String(demande)) themeSelect.value = reel;
    });
  }

  return themeApplique;
}
