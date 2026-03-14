// Ce script est exécuté en priorité depuis le <head>
(function () {
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

  let selectedTheme = localStorage.getItem("selectedTheme") || "default";

  if (!allowedThemes.includes(selectedTheme)) {
    console.warn(`Thème non autorisé : "${selectedTheme}"`);
    selectedTheme = "default";
  }

  if (selectedTheme !== "default") {
    const link = document.createElement("link");
    link.id = "theme-css";
    link.rel = "stylesheet";
    link.href = `public/themes/${selectedTheme}.css`;
    document.head.appendChild(link);
  }
})();
