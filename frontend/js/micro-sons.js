import { Sons } from './sons.js';
import { initialiserBoutonsTheme, initialiserTheme } from './theme.js';

window.Sons = window.Sons || Sons;

initialiserTheme();
initialiserBoutonsTheme();

if (!window.__qpucMicroSonsInitialises) {
  window.__qpucMicroSonsInitialises = true;

  document.addEventListener('click', (event) => {
    const elementSonore = event.target.closest('[data-sound]');
    if (!elementSonore) return;
    window.Sons?.jouer?.(elementSonore.dataset.sound);
  });
}
