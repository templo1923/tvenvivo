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
    let deferredPrompt = null;

    // Nuevo: Servidores proxy para evitar CORS y contenido mixto
    const PROXY_SERVERS = [
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://cors-anywhere.herokuapp.com/',
        'https://proxy.cors.sh/'
    ];
    let currentProxyIndex = 0;

    // Función para obtener URL a través de proxy
    function getProxiedUrl(url) {
        // Si ya es una URL local o relativa, no usar proxy
        if (url.startsWith('/') || url.startsWith(window.location.origin) || url.startsWith('data:')) {
            return url;
        }
        
        // Para el archivo JSON de canales, usar proxy
        if (url.includes('canales_organizados.json')) {
            return PROXY_SERVERS[currentProxyIndex] + encodeURIComponent(url);
        }
        
        // Para streams HTTP, usar proxy para convertirlos a HTTPS
        if (url.startsWith('http://')) {
            return PROXY_SERVERS[currentProxyIndex] + encodeURIComponent(url);
        }
        
        // Para otros casos, devolver la URL original
        return url;
    }

    // Función para rotar proxy si falla
    function rotateProxy() {
        currentProxyIndex = (currentProxyIndex + 1) % PROXY_SERVERS.length;
        console.log(`Cambiando a proxy: ${PROXY_SERVERS[currentProxyIndex]}`);
    }

    // Función para cargar canales desde JSON
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
                    
                    // Rotar proxy para el próximo intento
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

    // Función para deshabilitar controles de progreso y pausa
    function disableSeekAndPauseControls() {
        const video = document.getElementById('video');
        if (!video) return;

        // Prevenir interacción con la barra de progreso pero permitir controles de volumen
        const existingStyle = document.getElementById('hide-controls-style');
        if (!existingStyle) {
            const style = document.createElement('style');
            style.id = 'hide-controls-style';
            style.innerHTML = `
                /* Ocultar solo barra de progreso pero permitir controles de volumen */
                #video::-webkit-media-controls-timeline,
                #video::-webkit-media-controls-current-time-display,
                #video::-webkit-media-controls-time-remaining-display,
                #video::-webkit-media-controls-timeline-container {
                    display: none !important;
                }
                
                /* Ocultar en pantalla completa también */
                video:fullscreen::-webkit-media-controls-timeline,
                video:fullscreen::-webkit-media-controls-current-time-display,
                video:fullscreen::-webkit-media-controls-time-remaining-display {
                    display: none !important;
                }
                
                /* Asegurar que los controles nativos sean visibles en móviles */
                #video::-webkit-media-controls {
                    display: flex !important;
                }
                
                #video::-webkit-media-controls-volume-slider,
                #video::-webkit-media-controls-mute-button {
                    display: flex !important;
                }
                
                /* Para iOS específicamente */
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

    // Función para forzar la reproducción si se intenta pausar
    function preventVideoPause() {
        const video = document.getElementById('video');
        if (!video) return;

        video.addEventListener('pause', () => {
            // Si hay un canal cargado y el video se ha pausado, forzar su reproducción.
            if (currentChannel && video.paused) {
                // Usamos un pequeño timeout para evitar bucles infinitos en algunos navegadores.
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

    // Gestos táctiles
    function setupTouchGestures() {
        const videoPlayer = document.getElementById('video-player');
        let startX = 0;
        let startY = 0;
        let startTime = 0;
        const minSwipeDist = 50;
        const maxSwipeTime = 500;
        let isDoubleTap = false;
        
        // Para detectar doble tap
        let lastTap = 0;
        let tapTimeout;
        
        videoPlayer.addEventListener('touchstart', function(e) {
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                startTime = new Date().getTime();
                
                // Detectar doble tap
                const currentTime = new Date().getTime();
                const tapLength = currentTime - lastTap;
                
                if (tapLength < 300 && tapLength > 0) {
                    // Es un doble tap - toggle fullscreen
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
                    // Es un solo tap
                    isDoubleTap = false;
                    tapTimeout = setTimeout(() => {
                        lastTap = 0;
                    }, 300);
                }
                lastTap = currentTime;
            }
        }, { passive: true });
        
        videoPlayer.addEventListener('touchend', function(e) {
            if (isDoubleTap || e.touches.length > 0) return;
            
            const touch = e.changedTouches[0];
            const distX = touch.clientX - startX;
            const distY = touch.clientY - startY;
            const elapsedTime = new Date().getTime() - startTime;
            
            if (elapsedTime <= maxSwipeTime && !isDoubleTap) {
                if (Math.abs(distX) >= minSwipeDist && Math.abs(distY) <= 100) {
                    // Deslizamiento horizontal - Cambiar canal
                    if (distX > 0) {
                        navigateToPreviousChannel();
                    } else {
                        navigateToNextChannel();
                    }
                }
            }
        }, { passive: true });
        
        // Prevenir zoom con doble tap
        videoPlayer.addEventListener('gesturestart', function(e) {
            e.preventDefault();
        });
        
        videoPlayer.addEventListener('gesturechange', function(e) {
            e.preventDefault();
        });
        
        videoPlayer.addEventListener('gestureend', function(e) {
            e.preventDefault();
        });
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
                    
                    // Quitar resaltado del botón de favoritos
                    document.getElementById('favorites-toggle').classList.remove('active');
                    
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
        showingFavorites = false;

        // Quitar resaltado del botón de favoritos
        document.getElementById('favorites-toggle').classList.remove('active');
        
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
                window.iniciarReproductor({
  url: streamUrl,
  nombre: canal.nombre,
  categoria: categoria,
  logo: logoSrc
});

                toggleChannels();
                
                setTimeout(() => {
                    smoothScrollTo('player-container');
                }, 300);
            };
            grid.appendChild(item);
        });
        
        seccion.style.display = 'block';
    }

    // Función para cambiar de canal
    function cambiarCanal(url, nombre, categoria, logo) {
        console.log('Reproduciendo:', nombre, 'URL:', url);
        
        // Verificar conexión antes de intentar cargar un canal
        if (!navigator.onLine) {
            mostrarError('No hay conexión a internet. No se puede cargar el canal.');
            return;
        }
        
        document.getElementById('loading').style.display = 'flex';
        document.getElementById('error-message').style.display = 'none';
        
        document.querySelector('.player-placeholder').style.display = 'none';
        document.getElementById('video').style.display = 'block';
        
        document.querySelector('.channel-details').innerHTML = `
            <p><i class="fas fa-info-circle"></i> ${nombre}</p>
            <p><i class="fas fa-film"></i> Calidad: HD</p>
            <p><i class="fas fa-clock"></i> Estado: Conectando...</p>
            <p><i class="fas fa-align-left"></i> ${categoria}</p>
        `;
        
        document.getElementById('live-indicator-small').style.display = 'inline-flex';
        
        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const items = document.querySelectorAll('.channel-item');
        for (let item of items) {
            if (item.querySelector('.channel-name').textContent === nombre) {
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
        
        // Nuevo: Usar proxy para streams HTTP
        const proxiedUrl = getProxiedUrl(url);
        console.log(`Reproduciendo: ${nombre} desde URL: ${proxiedUrl}`);
        
        if (Hls.isSupported()) {
            currentHls = new Hls({
                debug: false,
                enableWorker: true,
                lowLatencyMode: true,
                
                // Buffering configuration OPTIMIZADA
                backBufferLength: 30,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                maxBufferSize: 60 * 1000 * 1000, // 60MB
                maxBufferHole: 0.1,
                
                // Asegurar que todos los fragmentos usen proxy
                xhrSetup: function(xhr, url) {
                    // Forzar todas las solicitudes a través del proxy
                    const proxiedUrl = getProxiedUrl(url);
                    xhr.open('GET', proxiedUrl, true);
                },
                
                // Live streaming configuration
                liveSyncDurationCount: 5,
                liveMaxLatencyDurationCount: 15,
                liveDurationInfinity: true,
                
                // ABR configuration
                abrEwmaDefaultEstimate: 500000,
                abrEwmaSlowLive: 3,
                abrEwmaFastLive: 2,
                abrEwmaDefaultLive: 1,
                
                // Performance
                stretchShortVideoTrack: true,
                maxFragLookUpTolerance: 0.1,
                emeEnabled: true,
                
                // Timeouts and retries
                manifestLoadingTimeOut: 10000,
                manifestLoadingMaxRetry: 3,
                manifestLoadingRetryDelay: 1000,
                levelLoadingTimeOut: 10000,
                levelLoadingMaxRetry: 3,
                levelLoadingRetryDelay: 1000,
                fragLoadingTimeOut: 20000,
                fragLoadingMaxRetry: 6,
                fragLoadingRetryDelay: 1000,
                
                // Additional optimizations
                enableDateRange: false,
                enableCEA708Captions: false,
                requestTimeout: 10000,
                levelLoadTimeout: 10000,
                fragLoadTimeout: 20000
            });
            
            currentHls.loadSource(proxiedUrl);
            currentHls.attachMedia(video);
            
            currentHls.on(Hls.Events.MANIFEST_PARSED, function() {
                addToStreamCache(url, url);
                document.getElementById('loading').style.display = 'none';
                retryCount = 0;
                
                video.play().catch(e => {
                    mostrarError('Error al reproducir: ' + e.message);
                });
                
                playbackPositionInterval = setInterval(savePlaybackPosition, 5000);
            });
            
            currentHls.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal) {
                    console.error('Error fatal de HLS:', data.details);
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            // Si hay un error de red, rotamos el proxy y reintentamos
                            mostrarError(`Error de conexión. Reintentando con otro servidor...`);
                            rotateProxy();
                            setTimeout(() => cambiarCanal(url, nombre, categoria, logo), 1000);
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error('Error de media, intentando recuperar...');
                            currentHls.recoverMediaError();
                            break;
                        default:
                            // Si es otro error fatal, lo destruimos y reintentamos
                            currentHls.destroy();
                            setTimeout(() => cambiarCanal(url, nombre, categoria, logo), 1000);
                            break;
                    }
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Para Safari y otros navegadores que soportan HLS nativamente
            video.src = proxiedUrl;
            video.addEventListener('loadedmetadata', function() {
                addToStreamCache(url, proxiedUrl);
                document.getElementById('loading').style.display = 'none';
                retryCount = 0;
                
                document.querySelector('.channel-details').innerHTML = `
                    <p><i class="fas fa-info-circle"></i> ${nombre}</p>
                    <p><i class="fas fa-film"></i> Calidad: HD</p>
                    <p><i class="fas fa-clock"></i> Estado: Transmitiendo</p>
                    <p><i class="fas fa-align-left"></i> ${categoria}</p>
                `;
                
                video.play().catch(e => {
                    mostrarError('Error al reproducir: ' + e.message);
                });
                
                playbackPositionInterval = setInterval(savePlaybackPosition, 5000);
            });
            
            video.addEventListener('error', function() {
                mostrarError('Error al cargar el video. Reintentando...');
                rotateProxy();
                setTimeout(() => cambiarCanal(url, nombre, categoria, logo), 2000);
            });
        } else {
            mostrarError("Tu navegador no soporta la reproducción de este formato.");
        }
        
        currentChannel = {
            url: url,
            name: nombre,
            description: categoria
        };
    }

    // Función para manejar errores de carga de imágenes
    function handleImageError(img) {
        img.onerror = null;
        
        // Si ya es una URL de proxy o está vacía, no hacer nada más
        if (!img.src || img.src.includes('corsproxy.io') || img.src.includes('cors-anywhere') || 
            img.src.includes('proxy.cors.sh') || img.src.includes('codetabs.com')) {
            return;
        }
        
        // Intentar con proxy primero
        const proxiedSrc = getProxiedUrl(img.src);
        
        // Crear una nueva imagen para probar
        const testImage = new Image();
        testImage.onload = function() {
            img.src = proxiedSrc;
        };
        testImage.onerror = function() {
            // Si falla, mostrar ícono por defecto directamente
            img.style.display = 'none';
            const container = img.parentElement;
            
            // Verificar si ya existe un ícono por defecto
            if (!container.querySelector('.default-icon')) {
                const defaultIcon = document.createElement('div');
                defaultIcon.className = 'default-icon';
                defaultIcon.innerHTML = '<i class="fas fa-tv"></i>';
                container.appendChild(defaultIcon);
            }
        };
        testImage.src = proxiedSrc;
    }

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
        
        // Actualizar el estado visual del ícono
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

    // Función para mostrar canales favoritos
    function mostrarFavoritos() {
        showingFavorites = true;
        
        // Resaltar el botón de favoritos
        document.getElementById('favorites-toggle').classList.add('active');
        
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

    // Configurar el botón de favoritos en el header
    function setupFavoritesToggle() {
        const favoritesToggle = document.getElementById('favorites-toggle');
        
        favoritesToggle.addEventListener('click', () => {
            // Mostrar favoritos
            mostrarFavoritos();
            
            // Si los canales están ocultos, mostrarlos primero
            if (!channelsVisible) {
                toggleChannels();
            }
            
            // Scroll suave a la sección de canales
            setTimeout(() => {
                smoothScrollTo('channels-container');
            }, 100);
        });
    }

    // Inicializar búsqueda
    function inicializarBusqueda() {
        const searchInput = document.getElementById('header-search-input');
        const searchSuggestions = document.getElementById('search-suggestions');
        
        if (!searchInput) return;
        
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
                               window.iniciarReproductor({
  url: streamUrl,
  nombre: canal.nombre,
  categoria: categoria,
  logo: logoSrc
});

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
                cambiarCanal(videoUrl, channelName, channelDescription);
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
            
            btn.addEventListener('click', () => {
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
            // Aquí puedes redirigir a otra página o mostrar un modal con información
            window.open('https://www.espn.com.ar/', '_blank');
        });
    }

    // Registrar Service Worker
    async function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                console.log('Service Worker registrado con éxito:', registration);
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
            document.body.classList.add('pwa-installed');
            console.log('La aplicación está ejecutándose como PWA instalada');
        }
        
        window.matchMedia('(display-mode: standalone)').addListener((e) => {
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

    // Al cargar la página, guardar una copia de los canales en localStorage
    // para tener un respaldo en caso de que falle la carga en el futuro
    window.addEventListener('beforeunload', function() {
        if (Object.keys(todosCanales).length > 0) {
            localStorage.setItem('canalesBackup', JSON.stringify(todosCanales));
        }
    });

    // Añadir esta función para habilitar controles nativos
    function enableNativeControls() {
        const video = document.getElementById('video');
        if (!video) return;
        
        // Habilitar controles nativos en dispositivos móviles
        video.controls = true;
        
        // Asegurar que los controles sean visibles
        const style = document.createElement('style');
        style.innerHTML = `
            /* Mostrar controles nativos en todos los dispositivos */
            #video {
                -webkit-appearance: none;
                -moz-appearance: none;
                appearance: none;
            }
            
            #video::-webkit-media-controls-panel {
                display: flex !important;
                opacity: 1 !important;
            }
            
            #video::-webkit-media-controls-play-button,
            #video::-webkit-media-controls-volume-slider,
            #video::-webkit-media-controls-mute-button {
                display: flex !important;
            }
            
            /* Asegurar que los controles sean visibles en iOS */
            #video::-webkit-media-controls-enclosure {
                display: flex !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Función debounce para optimizar eventos
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Inicializar la aplicación
    document.addEventListener('DOMContentLoaded', function() {
        cargarCanales();
        document.getElementById('toggle-channels-btn').addEventListener('click', toggleChannels);
        setupFloatingButton();
        setupHeaderSearch();
        setupTheme();
        setupViewToggle();
        setupSportsInfoButton();
        window.addEventListener('resize', debounce(adjustCategoryScroll, 250));
        
        // Nuevas inicializaciones
        setupShareFunctionality();
        loadChannelFromURL();
        
        // Inicializar funcionalidades PWA
        initPWA();

        // Configuración de controles de video
        disableSeekAndPauseControls();
        enableNativeControls();
        preventVideoPause();
        setupDoubleClickFullscreen();
        setupTouchGestures();
        
        // Configurar el nuevo botón de favoritos
        setupFavoritesToggle();
    });



