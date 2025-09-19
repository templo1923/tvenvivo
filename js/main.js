// js/main.js

document.addEventListener('DOMContentLoaded', function () {
  // Cargar canales y categorías
  cargarCanales();

  // Botón para mostrar/ocultar canales
  document.getElementById('toggle-channels-btn').addEventListener('click', toggleChannels);

  // Inicializar interfaz
  setupFloatingButton();
  setupHeaderSearch();
  setupTheme();
  setupViewToggle();
  setupFavoritesToggle();
  setupSportsInfoButton();

  // Reajustar scroll en móviles
  window.addEventListener('resize', debounce(adjustCategoryScroll, 250));

  // Compartir canal
  setupShareFunctionality();

  // Cargar canal desde URL si viene compartido
  loadChannelFromURL();

  // Inicializar PWA
  initPWA();

  // Configurar reproductor
  disableSeekAndPauseControls();
  enableNativeControls();
  preventVideoPause();
  setupDoubleClickFullscreen();
  setupTouchGestures();
});
