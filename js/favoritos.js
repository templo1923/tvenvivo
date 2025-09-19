// js/favoritos.js

let favorites = JSON.parse(localStorage.getItem('favoriteChannels')) || {};

function toggleFavorite(channelName, category, event) {
  if (event) event.stopPropagation();

  const channelId = `${category}-${channelName}`;

  if (favorites[channelId]) {
    delete favorites[channelId];
  } else {
    favorites[channelId] = {
      name: channelName,
      category: category
    };
  }

  saveFavorites();

  const favoriteIcons = document.querySelectorAll('.favorite-icon');
  favoriteIcons.forEach(icon => {
    const item = icon.closest('.channel-item');
    if (item && item.querySelector('.channel-name').textContent === channelName) {
      if (favorites[channelId]) {
        icon.classList.add('active');
      } else {
        icon.classList.remove('active');
      }
    }
  });

  if (window.showingFavorites) {
    window.mostrarFavoritos();
  }

  return favorites[channelId] !== undefined;
}

function saveFavorites() {
  localStorage.setItem('favoriteChannels', JSON.stringify(favorites));
}

function loadPlaybackPosition() {
  const playbackInfo = JSON.parse(localStorage.getItem('lastPlayback'));
  if (playbackInfo && playbackInfo.channel && playbackInfo.position) {
    document.getElementById('last-channel-name').textContent = playbackInfo.channel.name;
    document.getElementById('continue-modal').classList.add('active');

    document.getElementById('continue-yes').onclick = function () {
      window.iniciarReproductor({
        url: playbackInfo.channel.url,
        nombre: playbackInfo.channel.name,
        categoria: playbackInfo.channel.description,
        logo: playbackInfo.channel.logo || ''
      });

      const video = document.getElementById('video');
      const checkVideoReady = setInterval(function () {
        if (video.readyState > 0) {
          video.currentTime = playbackInfo.position;
          clearInterval(checkVideoReady);
        }
      }, 500);

      document.getElementById('continue-modal').classList.remove('active');
    };

    document.getElementById('continue-no').onclick = function () {
      localStorage.removeItem('lastPlayback');
      document.getElementById('continue-modal').classList.remove('active');
    };
  }
}

window.toggleFavorite = toggleFavorite;
window.saveFavorites = saveFavorites;
window.loadPlaybackPosition = loadPlaybackPosition;
