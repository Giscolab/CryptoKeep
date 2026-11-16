// Android presentation only. Vault data and cryptographic services stay shared.
if (globalThis.__CRYPTOKEEP_DESKTOP__?.platform === 'android') {
  document.documentElement.dataset.platform = 'android';
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'public/android.css';
  document.head.appendChild(stylesheet);
  document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('.main');
    const bar = document.createElement('header');
    bar.className = 'android-app-bar';
    const brand = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = 'CryptoKeep';
    const subtitle = document.createElement('span');
    subtitle.textContent = 'Votre coffre, sur cet appareil';
    brand.append(title, subtitle);
    const timer = document.getElementById('autolock-timer');
    if (timer) brand.append(timer);
    const lock = document.getElementById('logout-button');
    lock.setAttribute('aria-label', 'Verrouiller le coffre');
    lock.title = 'Verrouiller le coffre';
    lock.querySelector('span').textContent = 'Verrouiller';
    lock.querySelector('i').className = 'fas fa-lock';
    bar.append(brand, lock);
    main.before(bar);
    const labels = { 'nav-dashboard': 'Accueil', 'nav-passwords': 'Coffre', 'nav-security': 'Sécurité', 'nav-settings': 'Réglages' };
    const nav = document.querySelector('.sidebar nav');
    nav.setAttribute('aria-label', 'Navigation principale');
    const updateNavigation = () => {
      for (const link of nav.querySelectorAll('a')) {
        if (link.classList.contains('active')) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    };
    for (const link of nav.querySelectorAll('a')) {
      link.querySelector('.nav-text').textContent = labels[link.id];
      link.addEventListener('click', () => queueMicrotask(() => {
        main.scrollTop = 0;
        updateNavigation();
      }));
    }
    document.querySelector('#passwords-view h2').textContent = 'Mon coffre';
    document.querySelector('#dashboard-view h2').textContent = 'Vue d’ensemble';
    document.querySelector('#settings-view h2').textContent = 'Réglages';
    document.getElementById('searchInput').setAttribute('aria-label', 'Rechercher dans le coffre');
    // Start at the useful daily action, rather than a wide desktop dashboard.
    const vault = document.getElementById('vault-ui');
    new MutationObserver(() => {
      if (!vault.hidden) document.getElementById('nav-passwords').click();
    }).observe(vault, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(updateNavigation).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    updateNavigation();
  });
}
