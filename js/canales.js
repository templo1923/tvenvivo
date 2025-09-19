// js/player.js

let currentHls = null;
let playbackPositionInterval = null;
let intentos = 0;
const MAX_INTENTOS = 5;

window.iniciarReproductor = function iniciarReproductor({ url, nombre, categoria, logo }) {
  const video = document.getElementById('video');
  const loading = document.getElementById('loading');

  window.currentChannel = { url, name: nombre, description: categoria };

  if (!video) {
    console.error('No existe el elemento <video id="video">');
    return;
  }

  if (currentHls) {
    try { currentHls.destroy(); } catch (_) {}
    currentHls = null;
  }

  if (playbackPositionInterval) {
    clearInterval(playbackPositionInterval);
    playbackPositionInterval = null;
  }

  intentos = 0;
  if (loading) {
    loading.style.display = 'block';
    loading.textContent = 'Cargando canal...';
  }

  const proxiedUrl = window.getProxiedUrl(url);

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = proxiedUrl;
    video.addEventListener('loadedmetadata', onReadyOnce, { once: true });
    video.addEventListener('error', onVideoError);
  } else if (window.Hls && Hls.isSupported()) {
    currentHls = new Hls({
      debug: false,
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.1,
      xhrSetup: (xhr, requestUrl) => {
        const proxied = window.getProxiedUrl(requestUrl);
        xhr.open('GET', proxied, true);
      },
      liveSyncDurationCount: 5,
      liveMaxLatencyDurationCount: 15,
      liveDurationInfinity: true,
      abrEwmaDefaultEstimate: 500000,
      abrEwmaSlowLive: 3,
      abrEwmaFastLive: 2,
      abrEwmaDefaultLive: 1,
      stretchShortVideoTrack: true,
      maxFragLookUpTolerance: 0.1,
      emeEnabled: true,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 3,
      manifestLoadingRetryDelay: 1000,
      levelLoadingTimeOut: 10000,
      levelLoadingMaxRetry: 3,
      levelLoadingRetryDelay: 1000,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 1000,
      enableDateRange: false,
      enableCEA708Captions: false,
      requestTimeout: 10000,
      levelLoadTimeout: 10000,
      fragLoadTimeout: 20000,
      capLevelToPlayerSize: true
    });

    currentHls.attachMedia(video);
    currentHls.loadSource(proxiedUrl);
    currentHls.on(Hls.Events.MANIFEST_PARSED, onReadyOnce);
    currentHls.on(Hls.Events.ERROR, onHlsError);
  } else {
    window.mostrarError('Tu navegador no soporta este formato.');
  }

  function onReadyOnce() {
    if (loading) loading.style.display = 'none';

    try {
      const pos = Number(localStorage.getItem('pos_' + url) || 0);
      if (!isNaN(pos) && pos > 0) {
        video.currentTime = pos;
      }
    } catch (_) {}

    video.play().catch(e => {
      window.mostrarError('Error al reproducir: ' + e.message);
    });

    playbackPositionInterval = setInterval(() => {
      try {
        localStorage.setItem('pos_' + url, String(video.currentTime || 0));
      } catch (_) {}
    }, 5000);
  }

  function onHlsError(event, data) {
    if (!data || !data.fatal) return;

    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      manejarReintento('Error de red. Reintentando con otro servidor...');
    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      try {
        currentHls && currentHls.recoverMediaError();
      } catch (_) {}
    } else {
      manejarReintento('Error del reproductor. Reintentando...');
    }
  }

  function onVideoError() {
    manejarReintento('Error al cargar el video. Reintentando...');
  }

  function manejarReintento(mensaje) {
    window.mostrarError(mensaje);
    window.rotateProxy();
    if (intentos >= MAX_INTENTOS) {
      window.mostrarError('No se pudo conectar. Intenta más tarde.');
      return;
    }
    intentos++;
    setTimeout(() => {
      window.iniciarReproductor({ url, nombre, categoria, logo });
    }, 1200);
  }
};

// Controles adicionales del reproductor
function disableSeekAndPauseControls() {
  const video = document.getElementById('video');
  if (!video) return;

  const existingStyle = document.getElementById('hide-controls-style');
  if (!existingStyle) {
    const style = document.createElement('style');
    style.id = 'hide-controls-style';
    style.innerHTML = `
      #video::-webkit-media-controls-timeline,
      #video::-webkit-media-controls-current-time-display,
      #video::-webkit-media-controls-time-remaining-display,
      #video::-webkit-media-controls-timeline-container {
        display: none !important;
      }
      video:fullscreen::-webkit-media-controls-timeline,
      video:fullscreen::-webkit-media-controls-current-time-display,
      video:fullscreen::-webkit-media-controls-time-remaining-display {
        display: none !important;
      }
      #video::-webkit-media-controls {
        display: flex !important;
      }
      #video::-webkit-media-controls-volume-slider,
      #video::-webkit-media-controls-mute-button {
        display: flex !important;
      }
      #video::-webkit-media-controls-start-playback-button {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }
}

function preventVideoPause() {
  const video = document.getElementById('video');
  if (!video) return;

  video.addEventListener('pause', () => {
    if (window.currentChannel && video.paused) {
      setTimeout(() => {
        video.play().catch(e => console.warn("Reanudación forzada falló:", e));
      }, 150);
    }
  });
}

function setupDoubleClickFullscreen() {
  const videoPlayer = document.getElementById('video-player');
  if (!videoPlayer) return;

  videoPlayer.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
      videoPlayer.requestFullscreen().catch(err => {
        console.error(`Error al activar pantalla completa: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  });
}

function setupTouchGestures() {
  const videoPlayer = document.getElementById('video-player');
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  const minSwipeDist = 50;
  const maxSwipeTime = 500;
  let isDoubleTap = false;
  let lastTap = 0;
  let tapTimeout;

  videoPlayer.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = new Date().getTime();

      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;

      if (tapLength < 300 && tapLength > 0) {
        clearTimeout(tapTimeout);
        isDoubleTap = true;

        if (!document.fullscreenElement) {
          videoPlayer.requestFullscreen().catch(err => {
            console.error(`Error al activar pantalla completa: ${err.message}`);
          });
        } else {
          document.exitFullscreen();
        }
      } else {
        isDoubleTap = false;
        tapTimeout = setTimeout(() => {
          lastTap = 0;
        }, 300);
      }
      lastTap = currentTime;
    }
  }, { passive: true });

  videoPlayer.addEventListener('touchend', function (e) {
    if (isDoubleTap || e.touches.length > 0) return;

    const touch = e.changedTouches[0];
    const distX = touch.clientX - startX;
    const distY = touch.clientY - startY;
    const elapsedTime = new Date().getTime() - startTime;

    if (elapsedTime <= maxSwipeTime && !isDoubleTap) {
      if (Math.abs(distX) >= minSwipeDist && Math.abs(distY) <= 100) {
