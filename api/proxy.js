// /api/proxy.js
// --- VERSIÓN FINAL Y FUNCIONAL ---

const fetch = require('node-fetch');
const { URL } = require('url');

module.exports = async (req, res) => {
  // 1. Configuración de CORS para permitir que tu página web use este proxy
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // El navegador envía una solicitud OPTIONS primero para CORS, la aceptamos y terminamos
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Obtener la URL del canal que queremos ver desde la consulta
  const { url } = req.query;
  if (!url) {
    return res.status(400).send('Falta el parámetro "url" en la solicitud');
  }

  try {
    const decodedUrl = decodeURIComponent(url);

    // 3. Hacer la solicitud al servidor de streaming original
    const response = await fetch(decodedUrl, {
      headers: {
        // Usar un Referer genérico ayuda a evitar algunos bloqueos simples
        'Referer': 'https://google.com/', 
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Error en el servidor de origen ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    
    // 4. Revisar si la respuesta es una lista de reproducción M3U8
    if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL')) {
      const m3u8Content = await response.text();
      const baseUrl = new URL(decodedUrl);
      const origin = `${baseUrl.protocol}//${baseUrl.host}`;
      
      const processedContent = m3u8Content
        .split('\n')
        .map(line => {
          // Si la línea es una ruta relativa (no es comentario, no está vacía, no es una URL completa)
          if (line.trim() && !line.startsWith('#') && !line.startsWith('http')) {
            let segmentUrl;
            if (line.startsWith('/')) {
              // Si empieza con "/", la unimos al origen (ej: http://servidor.com/ruta.ts)
              segmentUrl = `${origin}${line}`;
            } else {
              // Si no, la unimos a la ruta base (ej: http://servidor.com/live/ruta.ts)
              const pathParts = baseUrl.pathname.split('/');
              pathParts.pop(); // Quitamos el nombre del archivo m3u8 actual
              const basePath = pathParts.join('/');
              segmentUrl = `${origin}${basePath}/${line}`;
            }
            // Devolvemos la ruta, pero apuntando a nuestro propio proxy
            return `/api/proxy?url=${encodeURIComponent(segmentUrl)}`;
          }
          // Devolvemos la línea sin cambios si es un comentario, una URL completa, etc.
          return line;
        })
        .join('\n');
      
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.status(200).send(processedContent);

    } else {
      // 5. Si no es una lista M3U8 (ej. un segmento de video .ts), lo pasamos directamente
      // Esto es crucial para no corromper el video.
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      response.body.pipe(res);
    }

  } catch (error) {
    console.error('Error fatal en el proxy:', error);
    res.status(500).send('Error en el servidor proxy: ' + error.message);
  }
};
