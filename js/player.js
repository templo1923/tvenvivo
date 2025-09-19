// js/player.js

// Variables internas del reproductor
let currentHls = null;
let playbackPositionInterval = null;
let intentos = 0;
const MAX_INTENTOS = 5;

// Ajusta esta función a tu proxy real
function getProxiedUrl(url) {
  // Ejemplo: si ya tienes una función en otro archivo, usa esa.
  // Aquí dejamos un "paso directo" para que funcione aunque no tengas proxy.
  return url;
}

// Si usas rotación de proxy, aquí pones tu lógica real
function rotateProxy() {
  // Ejemplo simple: no hace nada por ahora
  console.log('Rotar proxy (pendiente)');
}

// Muestra errores (si ya tienes mostrarError, puedes borrar esta versión)
function mostrarError(msg) {
  console.error(msg);
  const el = document.getElementById('loading');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    alert(msg);
  }
}

// Guarda posición cada 5s (si ya tienes savePlaybackPosition, usa la tuya)
function savePlaybackPosition() {
  try {
    const video = document.getElementById('video');
    const canal = window.currentChannel?.url || 'desconocido';
    localStorage.setItem('pos_' + canal, String(video.currentTime || 0));
  } catch (_) {}
}

// Expone una función global fácil de usar desde main.js
window.iniciarReproductor = function iniciarReproductor({ url, nombre, categoria, logo }) {
  const video = document.getElementById('video');
  const loading = document.getElementById('loading');

  // Guarda canal actual (útil para restaurar posición y métricas)
  window.currentChannel = { url, nombre, categoria, logo };

  if (!video) {
    console.error('No existe el elemento <video id="video">');
    return;
  }

  // Limpieza por si venías de otro canal
  if (currentHls) {
    try { currentHls.destroy(); } catch(_) {}
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

  const proxiedUrl = getProxiedUrl(url);

  // Safari (HLS nativo)
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = proxiedUrl;

    video.addEventListener('loadedmetadata', onReadyOnce, { once: true });
    video.addEventListener('error', onVideoError);

  } else if (window.Hls && Hls.isSupported()) {
    // HLS.js
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
        const proxied = getProxiedUrl(requestUrl);
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
      // Recomendable para no pedir calidades mayores que el tamaño del player
      capLevelToPlayerSize: true
    });

    currentHls.attachMedia(video);
    currentHls.loadSource(proxiedUrl);

    currentHls.on(Hls.Events.MANIFEST_PARSED, onReadyOnce);
    currentHls.on(Hls.Events.ERROR, onHlsError);
  } else {
    mostrarError('Tu navegador no soporta este formato.');
  }

  // Cuando está listo para reproducir
  function onReadyOnce() {
    if (loading) loading.style.display = 'none';
    // Restaurar posición si existe
    try {
      const pos = Number(localStorage.getItem('pos_' + url) || 0);
      if (!isNaN(pos) && pos > 0) {
        video.currentTime = pos;
      }
    } catch(_) {}

    video.play().catch(e => {
      mostrarError('Error al reproducir: ' + e.message);
    });

    playbackPositionInterval = setInterval(savePlaybackPosition, 5000);
  }

  // Errores con HLS.js
  function onHlsError(event, data) {
    if (!data || !data.fatal) return;

    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      manejarReintento('Error de red. Reintentando con otro servidor...');
    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      try {
        currentHls && currentHls.recoverMediaError();
      } catch(_) {}
    } else {
      manejarReintento('Error del reproductor. Reintentando...');
    }
  }

  // Errores con HLS nativo (Safari)
  function onVideoError() {
    manejarReintento('Error al cargar el video. Reintentando...');
  }

  function manejarReintento(mensaje) {
    mostrarError(mensaje);
    rotateProxy();
    if (intentos >= MAX_INTENTOS) {
      mostrarError('No se pudo conectar. Intenta más tarde.');
      return;
    }
    intentos++;
    setTimeout(() => {
      // Volvemos a iniciar el mismo canal
      window.iniciarReproductor({ url, nombre, categoria, logo });
    }, 1200);
  }
};
