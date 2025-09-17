// Variables globales
let currentHls = null;
let currentChannel = null;
let todosCanales = {};
let canalesCargados = false;
let channelsVisible = true;
let favorites = JSON.parse(localStorage.getItem('favoriteChannels')) || {};
let showingFavorites = false;
let playbackPositionInterval = null;
let retryCount = 0;
const MAX_RETRIES = 3;
let streamCache = JSON.parse(localStorage.getItem('streamCache')) || {};
let currentView = localStorage.getItem('viewPreference') || 'grid';

// ===== NUEVO: SISTEMA DE PROXY PARA REPRODUCCIÓN =====
const PROXY_SERVERS = [
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors-anywhere.herokuapp.com/',
    'https://proxy.cors.sh/'
];
let currentProxyIndex = 0;

// Función para obtener URL a través de proxy
function getProxiedUrl(url) {
    if (url.startsWith('/') || url.startsWith(window.location.origin) || url.startsWith('data:')) {
        return url;
    }
    
    if (url.includes('canales_organizados.json')) {
        return PROXY_SERVERS[currentProxyIndex] + encodeURIComponent(url);
    }
    
    if (url.startsWith('http://')) {
        return PROXY_SERVERS[currentProxyIndex] + encodeURIComponent(url);
    }
    
    return url;
}

// Función para rotar proxy si falla
function rotateProxy() {
    currentProxyIndex = (currentProxyIndex + 1) % PROXY_SERVERS.length;
    console.log(`Cambiando a proxy: ${PROXY_SERVERS[currentProxyIndex]}`);
}

// Función para deshabilitar controles de progreso y pausa
function disableSeekAndPauseControls() {
    const video = document.getElementById('video');
    if (!video) return;

    const existingStyle = document.getElementById('hide-controls-style');
    if (!existingStyle) {
        const style = document.createElement('style');
        style.id = 'hide-controls-style';
        style.innerHTML = `
            #video::-webkit-media-controls-timeline,
            #video::-webkit-media-controls-play-button,
            #video::-webkit-media-controls-pause-button,
            #video::-webkit-media-controls-current-time-display,
            #video::-webkit-media-controls-time-remaining-display,
            #video::-webkit-media-controls-timeline-container {
                display: none !important;
            }
            
            video:fullscreen::-webkit-media-controls-timeline,
            video:fullscreen::-webkit-media-controls-play-button,
            video:fullscreen::-webkit-media-controls-pause-button,
            video:fullscreen::-webkit-media-controls-current-time-display,
            video:fullscreen::-webkit-media-controls-time-remaining-display {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// Función para forzar la reproducción si se intenta pausar
function preventVideoPause() {
    const video = document.getElementById('video');
    if (!video) return;

    video.addEventListener('pause', () => {
        if (currentChannel && video.paused) {
            setTimeout(() => {
                video.play().catch(e => console.warn("Reanudación forzada falló:", e));
            }, 150);
        }
    });
}

// Función para habilitar pantalla completa con doble clic/tap
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

// Función para detectar si es stream en vivo
function isLiveStream(videoElement) {
    return videoElement && (videoElement.duration === Infinity || isNaN(videoElement.duration));
}

// Variables para funcionalidades PWA
let deferredPrompt = null;
let isAppInstalled = false;

// Variables para listas de reproducción
let playlists = JSON.parse(localStorage.getItem('playlists')) || {};

// Función para desplazar suavemente a un elemento
function smoothScrollTo(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Función para manejar errores de carga de imágenes
function handleImageError(img) {
    img.onerror = null;
    img.style.display = 'none';
    const container = img.parentElement;
    const defaultIcon = document.createElement('div');
    defaultIcon.className = 'default-icon';
    defaultIcon.innerHTML = '<i class="fas fa-tv"></i>';
    container.appendChild(defaultIcon);
}

// Función para ajustar el scroll de categorías en móvil
function adjustCategoryScroll() {
    if (window.innerWidth <= 768) {
        const sectionButtons = document.getElementById('section-buttons');
        if (sectionButtons) {
            sectionButtons.scrollLeft = 0;
        }
    }
}

// Función para guardar favoritos en localStorage
function saveFavorites() {
    localStorage.setItem('favoriteChannels', JSON.stringify(favorites));
}

// Función para guardar la última posición de reproducción
function savePlaybackPosition() {
    if (currentChannel && currentChannel.url) {
        const video = document.getElementById('video');
        const position = video.currentTime;
        
        const playbackInfo = {
            channel: currentChannel,
            position: position,
            timestamp: Date.now()
        };
        
        localStorage.setItem('lastPlayback', JSON.stringify(playbackInfo));
    }
}

// Función para cargar la última posición de reproducción
function loadPlaybackPosition() {
    const playbackInfo = JSON.parse(localStorage.getItem('lastPlayback'));
    if (playbackInfo && playbackInfo.channel && playbackInfo.position) {
        document.getElementById('last-channel-name').textContent = playbackInfo.channel.name;
        document.getElementById('continue-modal').classList.add('active');
        
        document.getElementById('continue-yes').onclick = function() {
            cambiarCanal(
                playbackInfo.channel.url, 
                playbackInfo.channel.name, 
                playbackInfo.channel.description
            );
            
            const video = document.getElementById('video');
            const checkVideoReady = setInterval(function() {
                if (video.readyState > 0) {
                    video.currentTime = playbackInfo.position;
                    clearInterval(checkVideoReady);
                }
            }, 500);
            
            document.getElementById('continue-modal').classList.remove('active');
        };
        
        document.getElementById('continue-no').onclick = function() {
            localStorage.removeItem('lastPlayback');
            document.getElementById('continue-modal').classList.remove('active');
        };
    }
}

// Función para alternar un canal como favorito
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
    
    if (showingFavorites) {
        mostrarFavoritos();
    }
    
    return favorites[channelId] !== undefined;
}

// Función para agregar a caché de streams
function addToStreamCache(url, data) {
    const keys = Object.keys(streamCache);
    if (keys.length >= 20) {
        delete streamCache[keys[0]];
    }
    
    streamCache[url] = {
        data: data,
        timestamp: Date.now()
    };
    
    localStorage.setItem('streamCache', JSON.stringify(streamCache));
}

// Función para obtener del caché de streams
function getFromStreamCache(url) {
    const cached = streamCache[url];
    if (cached && (Date.now() - cached.timestamp) < 3600000) {
        return cached.data;
    }
    return null;
}

// ===== FUNCIÓN CARGAR CANALES ACTUALIZADA =====
async function cargarCanales() {
    if (canalesCargados) return;
    
    try {
        mostrarLoading(true);
        
        // Intentar cargar desde múltiples ubicaciones
        const posiblesUbicaciones = [
            'canales_organizados.json',
            '/canales_organizados.json',
            './canales_organizados.json',
            'https://raw.githubusercontent.com/tu_usuario/tu_repo/main/canales_organizados.json'
        ];
        
        let response = null;
        let lastError = null;
        
        for (let i = 0; i < posiblesUbicaciones.length; i++) {
            try {
                const url = getProxiedUrl(posiblesUbicaciones[i]);
                console.log(`Intentando cargar canales desde: ${url}`);
                
                response = await fetch(url);
                if (response.ok) {
                    todosCanales = await response.json();
                    console.log('Canales cargados exitosamente desde:', posiblesUbicaciones[i]);
                    break;
                }
            } catch (error) {
                lastError = error;
                console.error(`Error cargando desde ${posiblesUbicaciones[i]}:`, error);
                
                if (i < posiblesUbicaciones.length - 1) {
                    rotateProxy();
                }
            }
        }
        
        if (!response || !response.ok) {
            throw lastError || new Error('No se pudo cargar el archivo de canales desde ninguna ubicación');
        }
        
        canalesCargados = true;
        
        crearBotonesCategorias();
        
        if (Object.keys(todosCanales).length > 0) {
            const primeraCategoria = Object.keys(todosCanales)[0];
            mostrarCategoria(primeraCategoria);
        }
        
        inicializarBusqueda();
        mostrarLoading(false);
        
        document.getElementById('toggle-favorites-btn').addEventListener('click', mostrarFavoritos);
        
        loadPlaybackPosition();
    } catch (error) {
        console.error('Error cargando canales:', error);
        
        // Intentar cargar una versión de respaldo desde localStorage
        try {
            const backup = localStorage.getItem('canalesBackup');
            if (backup) {
                todosCanales = JSON.parse(backup);
                canalesCargados = true;
                crearBotonesCategorias();
                
                if (Object.keys(todosCanales).length > 0) {
                    const primeraCategoria = Object.keys(todosCanales)[0];
                    mostrarCategoria(primeraCategoria);
                }
                
                mostrarLoading(false);
                showToast('Usando datos de respaldo. Algunos canales pueden estar desactualizados.');
                return;
            }
        } catch (backupError) {
            console.error('Error cargando respaldo:', backupError);
        }
        
        mostrarError('Error al cargar la lista de canales. Verifica tu conexión e intenta recargar la página.');
        mostrarLoading(false);
    }
}

// Función para crear botones de categorías
function crearBotonesCategorias() {
    const contenedor = document.getElementById('section-buttons');
    if (!contenedor) return;
    
    contenedor.innerHTML = '';
    
    Object.keys(todosCanales).forEach(categoria => {
        if (todosCanales[categoria].length > 0) {
            const boton = document.createElement('div');
            boton.className = 'section-button';
            boton.innerHTML = `<i class="fas fa-folder"></i> ${categoria}`;
            boton.onclick = () => {
                showingFavorites = false;
                document.querySelectorAll('.section-button').forEach(b => b.classList.remove('active'));
                boton.classList.add('active');
                mostrarCategoria(categoria);
                
                setTimeout(() => {
                    smoothScrollTo('channels-container');
                }, 100);
            };
            contenedor.appendChild(boton);
        }
    });
    
    if (contenedor.firstChild) {
        contenedor.firstChild.classList.add('active');
    }
    
    setTimeout(adjustCategoryScroll, 100);
}

// Función para mostrar canales de una categoría
function mostrarCategoria(categoria) {
    const canales = todosCanales[categoria];
    if (!canales) return;
    
    document.querySelectorAll('.channel-list').forEach(el => {
        el.style.display = 'none';
    });
    
    const seccionId = `categoria-${categoria.replace(/\W+/g, '-').toLowerCase()}`;
    let seccion = document.getElementById(seccionId);
    
    if (!seccion) {
        seccion = document.createElement('div');
        seccion.id = seccionId;
        seccion.className = 'channel-list';
        document.getElementById('channels-container').appendChild(seccion);
    }
    
    seccion.innerHTML = `
        <h2><i class="fas fa-folder"></i> ${categoria}</h2>
        <div class="channel-grid"></div>
    `;
    
    const grid = seccion.querySelector('.channel-grid');
    canales.forEach(canal => {
        const item = document.createElement('div');
        item.className = 'channel-item';
        
        const logoSrc = canal.logo || canal['tvg-logo'] || '';
        const channelId = `${categoria}-${canal.nombre}`;
        const isFavorite = favorites[channelId] !== undefined;
        
        item.innerHTML = `
            <div class="image-container">
                <img src="${logoSrc}" 
                     alt="${canal.nombre}" 
                     onerror="handleImageError(this)">
                <div class="favorite-icon ${isFavorite ? 'active' : ''}" onclick="toggleFavorite('${canal.nombre}', '${categoria}', event)">
                    <i class="fas fa-heart"></i>
                </div>
            </div>
            <div class="channel-name">${canal.nombre}</div>
            <div class="channel-description">${categoria}</div>
        `;
        
        const streamUrl = canal.url || canal.link || '';
        item.onclick = () => {
            cambiarCanal(streamUrl, canal.nombre, categoria, logoSrc);
            toggleChannels();
            
            setTimeout(() => {
                smoothScrollTo('player-container');
            }, 300);
        };
        grid.appendChild(item);
    });
    
    seccion.style.display = 'block';
}

// Función para mostrar canales favoritos
function mostrarFavoritos() {
    showingFavorites = true;
    
    document.querySelectorAll('.channel-list').forEach(el => {
        el.style.display = 'none';
    });
    
    document.querySelectorAll('.section-button').forEach(b => b.classList.remove('active'));
    
    const seccionId = 'favoritos';
    let seccion = document.getElementById(seccionId);
    
    if (!seccion) {
        seccion = document.createElement('div');
        seccion.id = seccionId;
        seccion.className = 'channel-list';
        document.getElementById('channels-container').appendChild(seccion);
    }
    
    const canalesFavoritos = [];
    for (const id in favorites) {
        const favorite = favorites[id];
        for (const categoria in todosCanales) {
            const canal = todosCanales[categoria].find(c => c.nombre === favorite.name);
            if (canal) {
                canalesFavoritos.push({
                    ...canal,
                    categoria: favorite.category || categoria
                });
                break;
            }
        }
    }
    
    if (canalesFavoritos.length === 0) {
        seccion.innerHTML = `
            <h2><i class="fas fa-heart"></i> Favoritos</h2>
            <div class="no-results" style="display: block;">
                <i class="fas fa-heart" style="color: #ff1500;"></i>
                <h3>No tienes canales favoritos</h3>
                <p>Haz clic en el corazón de un canal para agregarlo.</p>
            </div>
        `;
    } else {
        seccion.innerHTML = `
            <h2><i class="fas fa-heart"></i> Favoritos (${canalesFavoritos.length})</h2>
            <div class="channel-grid"></div>
        `;
        
        const grid = seccion.querySelector('.channel-grid');
        canalesFavoritos.forEach(canal => {
            const item = document.createElement('div');
            item.className = 'channel-item';
            
            const logoSrc = canal.logo || canal['tvg-logo'] || '';
            const channelId = `${canal.categoria}-${canal.nombre}`;
            const isFavorite = favorites[channelId] !== undefined;
            
            item.innerHTML = `
                <div class="image-container">
                    <img src="${logoSrc}" 
                         alt="${canal.nombre}" 
                         onerror="handleImageError(this)">
                    <div class="favorite-icon active" onclick="toggleFavorite('${canal.nombre}', '${canal.categoria}', event)">
                        <i class="fas fa-heart"></i>
                    </div>
                </div>
                <div class="channel-name">${canal.nombre}</div>
                <div class="channel-description">${canal.categoria}</div>
            `;
            
            const streamUrl = canal.url || canal.link || '';
            item.onclick = () => {
                cambiarCanal(streamUrl, canal.nombre, canal.categoria, logoSrc);
                toggleChannels();
                
                setTimeout(() => {
                    smoothScrollTo('player-container');
                }, 300);
            };
            grid.appendChild(item);
        });
    }
    
    seccion.style.display = 'block';
}

// Función para cambiar de canal
function cambiarCanal(url, nombre, categoria, logo) {
    console.log('Reproduciendo:', nombre, 'URL:', url);
    changeChannel(url, nombre, categoria);
    
    document.querySelector('.channel-details').innerHTML = `
        <p><i class="fas fa-info-circle"></i> ${nombre}</p>
        <p><i class="fas fa-film"></i> Calidad: HD</p>
        <p><i class="fas fa-clock"></i> Estado: Transmitiendo</p>
        <p><i class="fas fa-align-left"></i> ${categoria}</p>
    `;
    
    document.getElementById('live-indicator-small').style.display = 'inline-flex';
    
    // Actualizar metadatos para media session
    updateMediaMetadata(nombre, categoria, logo);
}

// ===== FUNCIÓN CHANGE CHANNEL ACTUALIZADA =====
function changeChannel(videoUrl, channelName, channelDescription) {
    if (!navigator.onLine) {
        mostrarError('No hay conexión a internet. No se puede cargar el canal.');
        return;
    }
    
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('error-message').style.display = 'none';
    
    document.querySelector('.player-placeholder').style.display = 'none';
    document.getElementById('video').style.display = 'block';
    
    document.querySelector('.channel-details').innerHTML = `
        <p><i class="fas fa-info-circle"></i> ${channelName}</p>
        <p><i class="fas fa-film"></i> Calidad: HD</p>
        <p><i class="fas fa-clock"></i> Estado: Conectando...</p>
        <p><i class="fas fa-align-left"></i> ${channelDescription}</p>
    `;
    
    document.getElementById('live-indicator-small').style.display = 'inline-flex';
    
    document.querySelectorAll('.channel-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const items = document.querySelectorAll('.channel-item');
    for (let item of items) {
        if (item.querySelector('.channel-name').textContent === channelName) {
            item.classList.add('active');
            break;
        }
    }
    
    var video = document.getElementById('video');
    
    if (currentHls) {
        currentHls.destroy();
    }
    
    if (playbackPositionInterval) {
        clearInterval(playbackPositionInterval);
    }
    
    video.pause();
    video.src = '';
    
    // Usar proxy para streams
    const proxiedUrl = getProxiedUrl(videoUrl);
    console.log(`Reproduciendo: ${channelName} desde URL: ${proxiedUrl}`);
    
    if (Hls.isSupported()) {
        currentHls = new Hls({
            debug: false,
            enableWorker: true,
            lowLatencyMode: true,
            xhrSetup: function(xhr, url) {
                if (url.startsWith('http://')) {
                    xhr.open('GET', getProxiedUrl(url), true);
                }
            }
        });
        
        currentHls.loadSource(proxiedUrl);
        currentHls.attachMedia(video);
        
        currentHls.on(Hls.Events.MANIFEST_PARSED, function() {
            addToStreamCache(videoUrl, proxiedUrl);
            document.getElementById('loading').style.display = 'none';
            retryCount = 0;
            
            document.querySelector('.channel-details').innerHTML = `
                <p><i class="fas fa-info-circle"></i> ${channelName}</p>
                <p><i class="fas fa-film"></i> Calidad: HD</p>
                <p><i class="fas fa-clock"></i> Estado: Transmitiendo</p>
                <p><i class="fas fa-align-left"></i> ${channelDescription}</p>
            `;
            
            video.play().catch(e => {
                mostrarError('Error al reproducir: ' + e.message);
            });
            
            playbackPositionInterval = setInterval(savePlaybackPosition, 5000);
        });
        
        currentHls.on(Hls.Events.ERROR, function(event, data) {
            console.error('Error HLS:', data);
            if (data.fatal) {
                switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        mostrarError('Error de red. Reintentando...');
                        rotateProxy();
                        setTimeout(() => changeChannel(videoUrl, channelName, channelDescription), 2000);
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        mostrarError('Error de medio. Recargando...');
                        currentHls.recoverMediaError();
                        break;
                    default:
                        mostrarError('Error desconocido. Reintentando...');
                        rotateProxy();
                        setTimeout(() => changeChannel(videoUrl, channelName, channelDescription), 2000);
                        break;
                }
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = proxiedUrl;
        video.addEventListener('loadedmetadata', function() {
            addToStreamCache(videoUrl, proxiedUrl);
            document.getElementById('loading').style.display = 'none';
            retryCount = 0;
            
            document.querySelector('.channel-details').innerHTML = `
                <p><i class="fas fa-info-circle"></i> ${channelName}</p>
                <p><i class="fas fa-film"></i> Calidad: HD</p>
                <p><i class="fas fa-clock"></i> Estado: Transmitiendo</p>
                <p><i class="fas fa-align-left"></i> ${channelDescription}</p>
            `;
            
            video.play().catch(e => {
                mostrarError('Error al reproducir: ' + e.message);
            });
            
            playbackPositionInterval = setInterval(savePlaybackPosition, 5000);
        });
        
        video.addEventListener('error', function() {
            mostrarError('Error al cargar el video. Reintentando...');
            rotateProxy();
            setTimeout(() => changeChannel(videoUrl, channelName, channelDescription), 2000);
        });
    } else {
        mostrarError("Tu navegador no soporta la reproducción de este formato.");
    }
    
    currentChannel = {
        url: videoUrl,
        name: channelName,
        description: channelDescription
    };
}

// Función para mostrar/ocultar canales
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
        
        if (showingFavorites) {
            mostrarFavoritos();
        } else if (Object.keys(todosCanales).length > 0) {
            const primeraCategoria = Object.keys(todosCanales)[0];
            mostrarCategoria(primeraCategoria);
        }
        
        setTimeout(() => {
            smoothScrollTo('channels-container');
        }, 100);
    } else {
        channelsContainer.style.display = 'none';
        sectionButtons.style.display = 'none';
        viewToggle.style.display = 'none';
        toggleBtn.innerHTML = '<i class="fas fa-list"></i> Mostrar Canales';
        
        setTimeout(() => {
            smoothScrollTo('player-container');
        }, 100);
    }
}

// Inicializar búsqueda
function inicializarBusqueda() {
    const searchInput = document.getElementById('header-search-input');
    const searchSuggestions = document.getElementById('search-suggestions');
    const voiceSearchBtn = document.getElementById('voice-search-btn');
    
    if (!searchInput) return;
    
    // Búsqueda por voz
    let recognition = null;
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = false;
        recognition.lang = 'es-ES';
        
        voiceSearchBtn.addEventListener('click', () => {
            if (recognition) {
                voiceSearchBtn.classList.add('listening');
                recognition.start();
            }
        });
        
        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            searchInput.value = transcript;
            searchInput.dispatchEvent(new Event('input'));
            voiceSearchBtn.classList.remove('listening');
        };
        
        recognition.onerror = function() {
            voiceSearchBtn.classList.remove('listening');
        };
    } else {
        voiceSearchBtn.style.display = 'none';
    }
    
    // Sugerencias en tiempo real
    searchInput.addEventListener('input', function(e) {
        const termino = e.target.value.toLowerCase().trim();
        searchSuggestions.innerHTML = '';
        
        if (termino.length < 2) {
            searchSuggestions.classList.remove('active');
            if (showingFavorites) {
                mostrarFavoritos();
            } else {
                Object.keys(todosCanales).forEach(categoria => {
                    const seccion = document.getElementById(`categoria-${categoria.replace(/\W+/g, '-').toLowerCase()}`);
                    if (seccion) seccion.style.display = 'block';
                });
            }
            document.getElementById('no-results').style.display = 'none';
            return;
        }
        
        // Generar sugerencias
        const sugerencias = [];
        Object.keys(todosCanales).forEach(categoria => {
            todosCanales[categoria].forEach(canal => {
                if (canal.nombre.toLowerCase().includes(termino) || 
                    categoria.toLowerCase().includes(termino)) {
                    sugerencias.push({ canal, categoria });
                }
            });
        });
        
        // Mostrar sugerencias
        if (sugerencias.length > 0) {
            searchSuggestions.classList.add('active');
            sugerencias.slice(0, 5).forEach(({ canal, categoria }) => {
                const suggestionItem = document.createElement('div');
                suggestionItem.className = 'suggestion-item';
                suggestionItem.innerHTML = `
                    <i class="fas fa-tv"></i> ${canal.nombre} <small>(${categoria})</small>
                `;
                suggestionItem.onclick = () => {
                    const streamUrl = canal.url || canal.link || '';
                    cambiarCanal(streamUrl, canal.nombre, categoria);
                    searchInput.value = '';
                    searchSuggestions.classList.remove('active');
                    toggleChannels();
                    setTimeout(() => smoothScrollTo('player-container'), 300);
                };
                searchSuggestions.appendChild(suggestionItem);
            });
        } else {
            searchSuggestions.classList.remove('active');
        }
        
        // Resto de la función de búsqueda
        document.querySelectorAll('.channel-list').forEach(el => {
            el.style.display = 'none';
        });
        
        let resultadosEncontrados = false;
        
        Object.keys(todosCanales).forEach(categoria => {
            const canales = todosCanales[categoria];
            const resultados = canales.filter(canal => 
                canal.nombre.toLowerCase().includes(termino) || 
                categoria.toLowerCase().includes(termino)
            );
            
            if (resultados.length > 0) {
                resultadosEncontrados = true;
                const seccionId = `categoria-${categoria.replace(/\W+/g, '-').toLowerCase()}`;
                let seccion = document.getElementById(seccionId);
                
                if (seccion) {
                    const grid = seccion.querySelector('.channel-grid');
                    grid.innerHTML = '';
                    
                    resultados.forEach(canal => {
                        const item = document.createElement('div');
                        item.className = 'channel-item';
                        
                        const logoSrc = canal.logo || canal['tvg-logo'] || '';
                        const channelId = `${categoria}-${canal.nombre}`;
                        const isFavorite = favorites[channelId] !== undefined;
                        
                        item.innerHTML = `
                            <div class="image-container">
                                <img src="${logoSrc}" 
                                     alt="${canal.nombre}" 
                                     onerror="handleImageError(this)">
                                <div class="favorite-icon ${isFavorite ? 'active' : ''}" onclick="toggleFavorite('${canal.nombre}', '${categoria}', event)">
                                    <i class="fas fa-heart"></i>
                                </div>
                            </div>
                            <div class="channel-name">${canal.nombre}</div>
                            <div class="channel-description">${categoria}</div>
                        `;
                        
                        const streamUrl = canal.url || canal.link || '';
                        item.onclick = () => {
                            cambiarCanal(streamUrl, canal.nombre, categoria, logoSrc);
                            toggleChannels();
                            
                            setTimeout(() => {
                                smoothScrollTo('player-container');
                            }, 300);
                        };
                        grid.appendChild(item);
                    });
                    
                    seccion.style.display = 'block';
                }
            }
        });
        
        document.getElementById('no-results').style.display = resultadosEncontrados ? 'none' : 'block';
        
        if (resultadosEncontrados) {
            setTimeout(() => {
                smoothScrollTo('channels-container');
            }, 100);
        }
    });
    
    // Cerrar sugerencias al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
            searchSuggestions.classList.remove('active');
        }
    });
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

function tryReconnect(videoUrl, channelName, channelDescription) {
    if (retryCount < MAX_RETRIES) {
        retryCount++;
        mostrarError(`Error de conexión. Reintentando... (${retryCount}/${MAX_RETRIES})`);
        
        setTimeout(() => {
            changeChannel(videoUrl, channelName, channelDescription);
        }, 3000);
    } else {
        mostrarError('No se pudo conectar al canal después de varios intentos, Recarga el reproductor y/o Cambia El Canal.');
        retryCount = 0;
    }
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
        if (searchForm.classList.contains('active')) {
            searchInput.focus();
        }
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

// Configurar el tema
function setupTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const icon = themeToggle.querySelector('i');
    
    // Cargar tema guardado
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Actualizar icono
    if (savedTheme === 'light') {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    }
    
    // Alternar tema al hacer clic
    themeToggle.addEventListener('click', () {
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

// Configurar vista (cuadrícula/lista)
function setupViewToggle() {
    const viewToggleButtons = document.querySelectorAll('.view-toggle-btn');
    
    // Establecer el botón activo según la preferencia guardada
    viewToggleButtons.forEach(btn => {
        if (btn.dataset.view === currentView) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
        
        btn.addEventListener('click', () {
            viewToggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentView = btn.dataset.view;
            localStorage.setItem('viewPreference', currentView);
            
            // Aplicar la nueva vista a todas las secciones
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

// Configurar botón de información deportiva
function setupSportsInfoButton() {
    const sportsInfoBtn = document.getElementById('sports-info-btn');
    
    sportsInfoBtn.addEventListener('click', () => {
        window.open('https://www.espn.com.ar/', '_blank');
    });
}




        // Registrar Service Worker
        async function registerServiceWorker() {
            if ('serviceWorker' in navigator) {
                try {
                    const registration = await navigator.serviceWorker.register('/service-worker.js');
                    console.log('Service Worker registrado con éxito:', registration);
                    
                    // Inicializar notificaciones push después de registrar el Service Worker
                    setTimeout(() => {
                        if (window.pushManager) {
                            window.pushManager.init();
                        }
                    }, 2000);
                    
                    return registration;
                } catch (error) {
                    console.error('Error registrando Service Worker:', error);
                    return null;
                }
            }
            return null;
        }

        // Verificar si la PWA está instalada
        function checkIfAppIsInstalled() {
            if (window.matchMedia('(display-mode: standalone)').matches) {
                isAppInstalled = true;
                document.body.classList.add('pwa-installed');
                console.log('La aplicación está ejecutándose como PWA instalada');
            }
            
            window.matchMedia('(display-mode: standalone)').addListener((e) => {
                isAppInstalled = e.matches;
                document.body.classList.toggle('pwa-installed', e.matches);
            });
        }

        // Manejar el evento de instalación
        function setupInstallPrompt() {
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredPrompt = e;
                
                const installButton = document.getElementById('install-button');
                if (installButton) {
                    installButton.style.display = 'block';
                    
                    installButton.addEventListener('click', async () => {
                        if (!deferredPrompt) return;
                        
                        deferredPrompt.prompt();
                        const { outcome } = await deferredPrompt.userChoice;
                        
                        if (outcome === 'accepted') {
                            console.log('Usuario aceptó instalar la PWA');
                        } else {
                            console.log('Usuario rechazó instalar la PWA');
                        }
                        
                        deferredPrompt = null;
                        installButton.style.display = 'none';
                    });
                }
            });
            
            window.addEventListener('appinstalled', () => {
                isAppInstalled = true;
                deferredPrompt = null;
                console.log('PWA instalada con éxito');
                
                const installButton = document.getElementById('install-button');
                if (installButton) {
                    installButton.style.display = 'none';
                }
                
                document.body.classList.add('pwa-installed');
            });
        }

        // Verificar estado de conexión
        function setupOnlineOfflineDetection() {
            function updateOnlineStatus() {
                if (navigator.onLine) {
                    document.body.classList.remove('offline');
                    document.body.classList.add('online');
                } else {
                    document.body.classList.remove('online');
                    document.body.classList.add('offline');
                    showOfflineMessage();
                }
            }
            
            window.addEventListener('online', updateOnlineStatus);
            window.addEventListener('offline', updateOnlineStatus);
            updateOnlineStatus();
        }

        // Mostrar mensaje de offline
        function showOfflineMessage() {
            let offlineMessage = document.getElementById('offline-message');
            if (offlineMessage) {
                offlineMessage.style.display = 'block';
                
                if (navigator.onLine) {
                    setTimeout(() => {
                        offlineMessage.style.display = 'none';
                    }, 5000);
                }
            }
        }

        // Inicializar todas las funcionalidades PWA
        async function initPWA() {
            await registerServiceWorker();
            checkIfAppIsInstalled();
            setupInstallPrompt();
            setupOnlineOfflineDetection();
        }

        // Función para compartir canal
        function setupShareFunctionality() {
            const shareButton = document.getElementById('share-channel-btn');
            const shareModal = document.getElementById('share-modal');
            const shareUrlInput = document.getElementById('share-url');
            const copyShareUrlButton = document.getElementById('copy-share-url');
            const closeShareModal = document.getElementById('close-share-modal');
            const socialShareButtons = document.querySelectorAll('.social-share-btn');
            
            shareButton.addEventListener('click', () => {
                if (!currentChannel) {
                    showToast('Selecciona un canal primero para compartir');
                    return;
                }
                
                // Generar URL única para el canal
                const baseUrl = window.location.origin + window.location.pathname;
                const shareUrl = `${baseUrl}?channel=${encodeURIComponent(currentChannel.name)}&category=${encodeURIComponent(currentChannel.description)}`;
                
                shareUrlInput.value = shareUrl;
                shareModal.classList.add('active');
            });
            
            copyShareUrlButton.addEventListener('click', () => {
                shareUrlInput.select();
                document.execCommand('copy');
                showToast('Enlace copiado al portapapeles');
            });
            
            closeShareModal.addEventListener('click', () => {
                shareModal.classList.remove('active');
            });
            
            // Compartir en redes sociales
            socialShareButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const platform = button.dataset.platform;
                    shareOnPlatform(platform, shareUrlInput.value, currentChannel.name);
                });
            });
            
            // Cerrar modal al hacer clic fuera
            shareModal.addEventListener('click', (e) => {
                if (e.target === shareModal) {
                    shareModal.classList.remove('active');
                }
            });
        }

        // Función para compartir en plataformas específicas
        function shareOnPlatform(platform, url, channelName) {
            let shareUrl = '';
            
            switch(platform) {
                case 'whatsapp':
                    shareUrl = `https://wa.me/?text=Mira ${encodeURIComponent(channelName)} en Maik Sport: ${encodeURIComponent(url)}`;
                    break;
                case 'facebook':
                    shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
                    break;
                case 'twitter':
                    shareUrl = `https://twitter.com/intent/tweet?text=Mira ${encodeURIComponent(channelName)} en Maik Sport&url=${encodeURIComponent(url)}`;
                    break;
                case 'telegram':
                    shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=Mira ${encodeURIComponent(channelName)} en Maik Sport`;
                    break;
            }
            
            window.open(shareUrl, '_blank', 'width=600,height=400');
        }

        // Función para mostrar notificación toast
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

        // Función para cargar canal desde URL
        function loadChannelFromURL() {
            const urlParams = new URLSearchParams(window.location.search);
            const channelName = urlParams.get('channel');
            const category = urlParams.get('category');
            
            if (channelName && category && todosCanales[category]) {
                const canal = todosCanales[category].find(c => c.nombre === channelName);
                if (canal) {
                    cambiarCanal(canal.url, canal.nombre, category, canal.logo);
                }
            }
        }

        // Función para gestionar listas de reproducción
        function setupPlaylistFunctionality() {
            const managePlaylistsBtn = document.getElementById('manage-playlists-btn');
            const playlistModal = document.getElementById('playlist-modal');
            const closePlaylistModal = document.getElementById('close-playlist-modal');
            const createPlaylistBtn = document.getElementById('create-playlist-btn');
            const newPlaylistNameInput = document.getElementById('new-playlist-name');
            const playlistList = document.getElementById('playlist-list');
            
            managePlaylistsBtn.addEventListener('click', () => {
                renderPlaylists();
                playlistModal.classList.add('active');
            });
            
            closePlaylistModal.addEventListener('click', () => {
                playlistModal.classList.remove('active');
            });
            
            createPlaylistBtn.addEventListener('click', () => {
                const name = newPlaylistNameInput.value.trim();
                if (name) {
                    createPlaylist(name);
                    newPlaylistNameInput.value = '';
                }
            });
            
            // Cerrar modal al hacer clic fuera
            playlistModal.addEventListener('click', (e) => {
                if (e.target === playlistModal) {
                    playlistModal.classList.remove('active');
                }
            });
        }

        // Crear una nueva lista de reproducción
        function createPlaylist(name) {
            if (playlists[name]) {
                showToast('Ya existe una lista con ese nombre');
                return;
            }
            
            playlists[name] = [];
            savePlaylists();
            renderPlaylists();
            showToast(`Lista "${name}" creada`);
        }

        // Guardar listas en localStorage
        function savePlaylists() {
            localStorage.setItem('playlists', JSON.stringify(playlists));
        }

        // Renderizar listas de reproducción
        function renderPlaylists() {
            const playlistList = document.getElementById('playlist-list');
            playlistList.innerHTML = '';
            
            Object.keys(playlists).forEach(playlistName => {
                const playlistItem = document.createElement('div');
                playlistItem.className = 'playlist-item';
                
                playlistItem.innerHTML = `
                    <div class="playlist-info">
                        <strong>${playlistName}</strong>
                        <span>(${playlists[playlistName].length} canales)</span>
                    </div>
                    <div class="playlist-actions">
                        <button class="playlist-action-btn play-playlist" data-playlist="${playlistName}">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="playlist-action-btn add-to-playlist" data-playlist="${playlistName}">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="playlist-action-btn delete-playlist" data-playlist="${playlistName}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
                
                playlistList.appendChild(playlistItem);
            });
            
            // Añadir event listeners a los botones
            document.querySelectorAll('.play-playlist').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const playlistName = btn.dataset.playlist;
                    playPlaylist(playlistName);
                });
            });
            
            document.querySelectorAll('.add-to-playlist').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const playlistName = btn.dataset.playlist;
                    addCurrentChannelToPlaylist(playlistName);
                });
            });
            
            document.querySelectorAll('.delete-playlist').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const playlistName = btn.dataset.playlist;
                    deletePlaylist(playlistName);
                });
            });
        }

        // Reproducir una lista de reproducción
        function playPlaylist(playlistName) {
            const channels = playlists[playlistName];
            if (channels.length === 0) {
                showToast('La lista está vacía');
                return;
            }
            
            let currentIndex = 0;
            
            function playNextChannel() {
                if (currentIndex < channels.length) {
                    const channel = channels[currentIndex];
                    cambiarCanal(channel.url, channel.name, channel.category, channel.logo);
                    currentIndex++;
                    
                    // Reproducir siguiente canal cuando termine el actual
                    const video = document.getElementById('video');
                    video.onended = playNextChannel;
                }
            }
            
            playNextChannel();
            showToast(`Reproduciendo lista: ${playlistName}`);
        }

        // Añadir canal actual a la lista de reproducción
        function addCurrentChannelToPlaylist(playlistName) {
            if (!currentChannel) {
                showToast('No hay ningún canal reproduciéndose');
                return;
            }
            
            // Verificar si el canal ya está en la lista
            const alreadyInPlaylist = playlists[playlistName].some(
                channel => channel.name === currentChannel.name && channel.category === currentChannel.description
            );
            
            if (alreadyInPlaylist) {
                showToast('Este canal ya está en la lista');
                return;
            }
            
            playlists[playlistName].push({
                name: currentChannel.name,
                url: currentChannel.url,
                category: currentChannel.description,
                logo: currentChannel.logo
            });
            
            savePlaylists();
            showToast(`Canal añadido a "${playlistName}"`);
        }

        // Eliminar lista de reproducción
        function deletePlaylist(playlistName) {
            if (confirm(`¿Estás seguro de que quieres eliminar la lista "${playlistName}"?`)) {
                delete playlists[playlistName];
                savePlaylists();
                renderPlaylists();
                showToast(`Lista "${playlistName}" eliminada`);
            }
        }
        
        // Gestos táctiles
        function setupTouchGestures() {
            const videoPlayer = document.getElementById('video-player');
            let startX = 0;
            let startY = 0;
            let distX = 0;
            let distY = 0;
            let startTime = 0;
            const minSwipeDist = 50;
            const maxSwipeTime = 500;
            
            videoPlayer.addEventListener('touchstart', function(e) {
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                startTime = new Date().getTime();
            }, { passive: true });
            
            videoPlayer.addEventListener('touchend', function(e) {
                const touch = e.changedTouches[0];
                distX = touch.clientX - startX;
                distY = touch.clientY - startY;
                const elapsedTime = new Date().getTime() - startTime;
                
                if (elapsedTime <= maxSwipeTime) {
                    if (Math.abs(distX) >= minSwipeDist && Math.abs(distY) <= 100) {
                        // Deslizamiento horizontal - Cambiar canal
                        if (distX > 0) {
                            navigateToPreviousChannel();
                        } else {
                            navigateToNextChannel();
                        }
                    } else if (Math.abs(distY) >= minSwipeDist && Math.abs(distX) <= 100) {
                        // Deslizamiento vertical - Control de volumen
                        const video = document.getElementById('video');
                        if (distY > 0) {
                            // Deslizar hacia abajo - Disminuir volumen
                            video.volume = Math.max(0, video.volume - 0.1);
                            showToast(`Volumen: ${Math.round(video.volume * 100)}%`);
                        } else {
                            // Deslizar hacia arriba - Aumentar volumen
                            video.volume = Math.min(1, video.volume + 0.1);
                            showToast(`Volumen: ${Math.round(video.volume * 100)}%`);
                        }
                    }
                }
            }, { passive: true });
        }

        // Navegar al canal anterior
        function navigateToPreviousChannel() {
            if (!currentChannel) return;
            
            const currentCategory = currentChannel.description;
            const currentChannels = todosCanales[currentCategory];
            
            if (!currentChannels) return;
            
            const currentIndex = currentChannels.findIndex(c => c.nombre === currentChannel.name);
            if (currentIndex > 0) {
                const previousChannel = currentChannels[currentIndex - 1];
                cambiarCanal(previousChannel.url, previousChannel.nombre, currentCategory, previousChannel.logo);
            }
        }

        // Navegar al siguiente canal
        function navigateToNextChannel() {
            if (!currentChannel) return;
            
            const currentCategory = currentChannel.description;
            const currentChannels = todosCanales[currentCategory];
            
            if (!currentChannels) return;
            
            const currentIndex = currentChannels.findIndex(c => c.nombre === currentChannel.name);
            if (currentIndex < currentChannels.length - 1) {
                const nextChannel = currentChannels[currentIndex + 1];
                cambiarCanal(nextChannel.url, nextChannel.nombre, currentCategory, nextChannel.logo);
            }
        }

        // Reproducción en segundo plano
        function setupBackgroundPlayback() {
            let wakeLock = null;
            
            // Solicitar Wake Lock
            async function requestWakeLock() {
                try {
                    if ('wakeLock' in navigator) {
                        wakeLock = await navigator.wakeLock.request('screen');
                        console.log('Wake Lock activado');
                    }
                } catch (err) {
                    console.error('Error al activar Wake Lock:', err);
                }
            }
            
            // Liberar Wake Lock
            function releaseWakeLock() {
                if (wakeLock) {
                    wakeLock.release();
                    wakeLock = null;
                }
            }
            
            // Activar Wake Lock cuando se reproduce video
            const video = document.getElementById('video');
            video.addEventListener('play', () => {
                requestWakeLock();
            });
            
            video.addEventListener('pause', () => {
                // No liberamos el wakelock en pausa, porque estamos forzando la re-reproducción
            });
            
            // Reactivar Wake Lock cuando la página vuelve a ser visible
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && !video.paused) {
                    requestWakeLock();
                }
            });
            
            // Configurar Media Session API
            if ('mediaSession' in navigator) {
                setupMediaSession();
            }
        }

        // Configurar Media Session API
        function setupMediaSession() {
            navigator.mediaSession.setActionHandler('play', () => {
                document.getElementById('video').play();
            });
            
            // Eliminar el manejador de pausa
            navigator.mediaSession.setActionHandler('pause', null);
            
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                navigateToPreviousChannel();
            });
            
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                navigateToNextChannel();
            });
        }

        // Actualizar metadatos de Media Session
        function updateMediaMetadata(channelName, category, logo) {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: channelName,
                    artist: category,
                    artwork: [
                        { src: logo || 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                        { src: logo || 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
                    ]
                });
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            cargarCanales();
            document.getElementById('toggle-channels-btn').addEventListener('click', toggleChannels);
            
            // Inicializaciones clave
            disableSeekAndPauseControls(); // Oculta controles de pausa y seek
            preventVideoPause();           // Previene la pausa mediante eventos
            setupDoubleClickFullscreen();  // Habilita doble clic para fullscreen
            
            setupFloatingButton();
            setupHeaderSearch();
            setupTheme();
            setupViewToggle();
            setupSportsInfoButton();
            window.addEventListener('resize', adjustCategoryScroll);
            
            // Demás inicializaciones
            setupTouchGestures();
            setupBackgroundPlayback();
            setupShareFunctionality();
            setupPlaylistFunctionality();
            loadChannelFromURL();
            
            // Inicializar funcionalidades PWA
            initPWA();
        });

