// js/ui.js

let channelsVisible = true;
let currentView = localStorage.getItem('viewPreference') || 'grid';

function toggleChannels() {
  const channelsContainer = document.getElementById('channels-container');
  const sectionButtons = document.getElementById('section-buttons');
  const viewToggle = document.getElementById('view-toggle');
  const toggleBtn = document.getElementById('toggle-channels-btn');

  channelsVisible = !channelsVisible;

  if (channelsVisible) {
    channelsContainer.style.display = 'block';
    sectionButtons.style.display = 'flex';
    viewToggle.style.display = 'flex';
    toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Ocultar Canales';
    setTimeout(() => smoothScrollTo('channels-container'), 100);
  } else {
    channelsContainer.style.display = 'none';
    sectionButtons.style.display = 'none';
    viewToggle.style.display = 'none';
    toggleBtn.innerHTML = '<i class="fas fa-list"></i> Mostrar Canales';
    setTimeout(() => smoothScrollTo('player-container'), 100);
  }
}

function setupFavoritesToggle() {
  const favoritesToggle = document.getElementById('favorites-toggle');
  favoritesToggle.addEventListener('click', () => {
    mostrarFavoritos();
    if (!channelsVisible) toggleChannels();
    setTimeout(() => smoothScrollTo('channels-container'), 100);
  });
}

function smoothScrollTo(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function adjustCategoryScroll() {
  if (window.innerWidth <= 768) {
    const sectionButtons = document.getElementById('section-buttons');
    if (sectionButtons) sectionButtons.scrollLeft = 0;
  }
}

function mostrarLoading(mostrar) {
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = mostrar ? 'flex' : 'none';
}

function mostrarError(mensaje) {
  const errorDiv = document.getElementById('error-message');
  if (errorDiv) {
    errorDiv.textContent = mensaje;
    errorDiv.style.display = 'flex';
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 5000);
  }
}

function showToast(message) {
  let toast = document.getElementById('share-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'share-toast';
    toast.className = 'share-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function setupFloatingButton() {
  const floatingButton = document.getElementById('back-to-player');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      floatingButton.classList.add('visible');
    } else {
      floatingButton.classList.remove('visible');
    }
  });

  floatingButton.addEventListener('click', () => {
    smoothScrollTo('player-container');
  });
}

function setupHeaderSearch() {
  const searchToggle = document.getElementById('search-toggle');
  const searchForm = document.getElementById('header-search-form');
  const searchInput = document.getElementById('header-search-input');
  const searchClose = document.getElementById('header-search-close');

  searchToggle.addEventListener('click', () => {
    searchForm.classList.toggle('active');
    if (searchForm.classList.contains('active')) searchInput.focus();
  });

  searchClose.addEventListener('click', () => {
    searchForm.classList.remove('active');
    searchInput.value = '';

    if (showingFavorites) {
      mostrarFavoritos();
    } else {
      Object.keys(todosCanales).forEach(categoria => {
        const seccion = document.getElementById(`categoria-${categoria.replace(/\W+/g, '-').toLowerCase()}`);
        if (seccion) seccion.style.display = 'block';
      });
    }

    document.getElementById('no-results').style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (!searchForm.contains(e.target) && e.target !== searchToggle) {
      searchForm.classList.remove('active');
    }
  });
}

function setupViewToggle() {
  const viewToggleButtons = document.querySelectorAll('.view-toggle-btn');

  viewToggleButtons.forEach(btn => {
    if (btn.dataset.view === currentView) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }

    btn.addEventListener('click', () => {
      viewToggleButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentView = btn.dataset.view;
      localStorage.setItem('viewPreference', currentView);

      document.querySelectorAll('.channel-list').forEach(section => {
        if (currentView === 'list') {
          section.classList.add('list-view');
        } else {
          section.classList.remove('list-view');
        }
      });
    });
  });
}

function setupTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const icon = themeToggle.querySelector('i');
  const savedTheme = localStorage.getItem('theme') || 'dark';

  document.documentElement.setAttribute('data-theme', savedTheme);

  if (savedTheme === 'light') {
    icon.classList.remove('fa-moon');
    icon.classList.add('fa-sun');
  } else {
    icon.classList.remove('fa-sun');
    icon.classList.add('fa-moon');
  }

  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    if (newTheme === 'light') {
      icon.classList.remove('fa-moon');
      icon.classList.add('fa-sun');
    } else {
      icon.classList.remove('fa-sun');
      icon.classList.add('fa-moon');
    }
  });
}

window.toggleChannels = toggleChannels;
window.setupFavoritesToggle = setupFavoritesToggle;
window.smoothScrollTo = smoothScrollTo;
window.adjustCategoryScroll = adjustCategoryScroll;
window.mostrarLoading = mostrarLoading;
window.mostrarError = mostrarError;
window.showToast = showToast;
window.setupFloatingButton = setupFloatingButton;
window.setupHeaderSearch = setupHeaderSearch;
window.setupViewToggle = setupViewToggle;
window.setupTheme = setupTheme;
