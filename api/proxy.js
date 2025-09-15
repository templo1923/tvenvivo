// /api/proxy.js
const fetch = require('node-fetch');
const { URL } = require('url');

module.exports = async (req, res) => {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Manejar solicitudes OPTIONS para CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).send('Falta el parámetro "url"');
  }

  try {
    const decodedUrl = decodeURIComponent(url);

    const response = await fetch(decodedUrl, {
      headers: {
        // Usar un Referer genérico puede ayudar a evitar bloqueos
        'Referer': 'https://google.com/', 
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    if (!response.ok) {
      return res.status(response.status).send(`Error ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    
    // Si es un archivo de lista de reproducción M3U8
    if (contentType && contentType.includes('application/vnd.apple.mpegurl')) {
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
              // Ruta absoluta desde el origen del streaming
              segmentUrl = `${origin}${line}`;
            } else {
              // Ruta relativa al path del M3U8
              const pathParts = baseUrl.pathname.split('/');
              pathParts.pop(); // Quitar el nombre del archivo m3u8
              const basePath = pathParts.join('/');
              segmentUrl = `${origin}${basePath}/${line}`;
            }
            // Devolver la URL completa pasando por nuestro proxy
            return `/api/proxy?url=${encodeURIComponent(segmentUrl)}`;
          }
          // Devolver la línea sin cambios si es un comentario o una URL completa
          return line;
        })
        .join('\n');
      
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.status(200).send(processedContent);

    } else {
      // Para cualquier otro tipo de contenido (como los segmentos de video .ts)
      // Lo pasamos directamente sin convertirlo a texto.
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      response.body.pipe(res);
    }

  } catch (error) {
    console.error('Error en el proxy:', error);
    res.status(500).send('Error al contactar el servidor de streaming: ' + error.message);
  }
};
