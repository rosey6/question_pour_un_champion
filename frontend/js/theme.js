// ============================================
// THEME.JS — Theme sombre/clair persistant
// ============================================

const CLE_THEME = 'qpuc_theme';

function appliquerTheme(theme) {
  const themeNormalise = theme === 'clair' ? 'clair' : 'sombre';
  document.documentElement.dataset.theme = themeNormalise === 'clair' ? 'clair' : '';
  document.querySelectorAll('[data-theme-toggle]').forEach((bouton) => {
    bouton.textContent = themeNormalise === 'clair' ? '☀' : '☾';
    bouton.setAttribute('aria-label', themeNormalise === 'clair' ? 'Activer le thème sombre' : 'Activer le thème clair');
    bouton.setAttribute('title', 'Changer le thème');
  });
}

export function initialiserTheme() {
  const sauvegarde = localStorage.getItem(CLE_THEME);
  const prefereSombre = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  const theme = sauvegarde ?? (prefereSombre ? 'sombre' : 'clair');

  appliquerTheme(theme);
}

export function toggleTheme() {
  const themeActuel = document.documentElement.dataset.theme === 'clair' ? 'clair' : 'sombre';
  const nouveauTheme = themeActuel === 'clair' ? 'sombre' : 'clair';

  appliquerTheme(nouveauTheme);
  localStorage.setItem(CLE_THEME, nouveauTheme);
}

export function initialiserBoutonsTheme() {
  window.toggleTheme = toggleTheme;

  document.querySelectorAll('[data-theme-toggle]').forEach((bouton) => {
    if (bouton.dataset.themePret === 'oui') return;
    bouton.dataset.themePret = 'oui';
    bouton.addEventListener('click', toggleTheme);
  });
}
