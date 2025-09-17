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

        // Función para cargar canales desde JSON (MODIFICADA)
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

        // Función para cambiar de canal (MODIFICADA)
        function changeChannel(videoUrl, channelName, channelDescription) {
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
            
            // Nuevo: Usar proxy para streams HTTP
            const proxiedUrl = getProxiedUrl(videoUrl);
            console.log(`Reproduciendo: ${channelName} desde URL: ${proxiedUrl}`);
            
            if (Hls.isSupported()) {
                currentHls = new Hls({
                    debug: false,
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90,
                    xhrSetup: function(xhr, url) {
                        // Asegurar que todas las solicitudes sean a través de proxy si es necesario
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
                // Para Safari y otros navegadores que soportan HLS nativamente
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

        // Función para manejar errores de carga de imágenes (MEJORADA)
        function handleImageError(img) {
            img.onerror = null;
            
            // Intentar con diferentes servidores de imágenes
            const originalSrc = img.src;
            const imageServers = [
                'https://images.weserv.nl/?url=',
                'https://cdn.jsdelivr.net/gh/tu_usuario/tu_repo@main/',
                'https://raw.githubusercontent.com/tu_usuario/tu_repo/main/'
            ];
            
            let attempts = 0;
            const maxAttempts = imageServers.length;
            
            function tryNextServer() {
                if (attempts >= maxAttempts) {
                    // Si todos los servidores fallan, mostrar ícono por defecto
                    img.style.display = 'none';
                    const container = img.parentElement;
                    const defaultIcon = document.createElement('div');
                    defaultIcon.className = 'default-icon';
                    defaultIcon.innerHTML = '<i class="fas fa-tv"></i>';
                    container.appendChild(defaultIcon);
                    return;
                }
                
                const server = imageServers[attempts];
                attempts++;
                
                // Extraer la URL real de la imagen (eliminar parámetros de caché si existen)
                let cleanUrl = originalSrc.split('?')[0];
                
                // Crear nueva URL con el servidor de imágenes
                const newSrc = server + encodeURIComponent(cleanUrl);
                
                // Crear una nueva imagen para probar
                const testImage = new Image();
                testImage.onload = function() {
                    // Si se carga correctamente, actualizar la imagen original
                    img.src = newSrc;
                    img.style.display = 'block';
                    
                    // Eliminar cualquier ícono por defecto existente
                    const existingIcon = img.parentElement.querySelector('.default-icon');
                    if (existingIcon) {
                        existingIcon.remove();
                    }
                };
                testImage.onerror = tryNextServer;
                testImage.src = newSrc;
            }
            
            tryNextServer();
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

        document.addEventListener('DOMContentLoaded', function() {
            cargarCanales();
            document.getElementById('toggle-channels-btn').addEventListener('click', toggleChannels);
            setupFloatingButton();
            setupHeaderSearch();
            setupTheme();
            setupViewToggle();
            setupSportsInfoButton();
            window.addEventListener('resize', adjustCategoryScroll);
            
            // Nuevas inicializaciones
            setupShareFunctionality();
            loadChannelFromURL(); // Cargar canal desde URL si existe
            
            // Inicializar funcionalidades PWA
            initPWA();
        });
