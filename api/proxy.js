// /api/proxy.js - VERSIÓN CORREGIDA
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
    
    console.log('Solicitando URL:', decodedUrl);

    const response = await fetch(decodedUrl, {
      headers: {
        'Referer': 'https://tutv.plus/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
      },
      timeout: 10000,
    });

    if (!response.ok) {
      console.error('Error en respuesta:', response.status, response.statusText);
      return res.status(response.status).send(`Error ${response.status}: ${response.statusText}`);
    }
    
    // Obtener el contenido y tipo
    const contentType = response.headers.get('content-type');
    const content = await response.text();
    
    if (contentType && contentType.includes('application/vnd.apple.mpegurl')) {
      const m3u8Content = await response.text();
      const baseUrl = new URL(decodedUrl);
      const origin = `${baseUrl.protocol}//${baseUrl.host}`;
      
      console.log('Procesando archivo M3U8');
      
      // Es un archivo M3U8 - procesar para reescribir URLs
      const baseUrl = new URL(decodedUrl);
      const origin = `${baseUrl.protocol}//${baseUrl.host}`;
      
      const processedContent = m3u8Content
        .split('\n')
        .map(line => {
          // Ignorar líneas vacías o comentarios
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
          // Si no es una ruta o ya es una URL completa, devolverla sin cambio
          return line;
        })
        .join('\n');

      // Configurar headers para la respuesta
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

      // Enviar el contenido procesado
      res.status(200).send(processedContent);
    } else {
      // Es otro tipo de contenido (TS, etc.) - enviar directamente
       if (contentType) {
          res.setHeader('Content-Type', contentType);
          }
       res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        response.body.pipe(res);
       }              
            return line;
          }
          
          // Si es un segmento (TS o m3u8) y no es una URL absoluta
          if ((line.endsWith('.ts') || line.includes('.m3u8')) && !line.startsWith('http')) {
            let segmentUrl;
            
            if (line.startsWith('/')) {
              // URL absoluta en el mismo dominio
              segmentUrl = `${origin}${line}`;
            } else {
              // URL relativa - construir path completo
              const pathParts = baseUrl.pathname.split('/');
              pathParts.pop(); // Remover el nombre del archivo actual
              const basePath = pathParts.join('/');
              segmentUrl = `${origin}${basePath}/${line}`;
            }
            
            console.log('Reescribiendo segmento:', line, '->', `/api/proxy?url=${encodeURIComponent(segmentUrl)}`);
            return `/api/proxy?url=${encodeURIComponent(segmentUrl)}`;
          }
          
          return line;
        })
        .join('\n');
      
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.status(200).send(processedContent);
      
    } else if (contentType && contentType.includes('video/mp2t')) {
      // Es un segmento TS - servir directamente
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(200).send(content);
      
    } else {
      // Otro tipo de contenido
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(200).send(content);
    }

  } catch (error) {
    console.error('Error en el proxy:', error);
    res.status(500).send('Error al contactar el servidor de streaming: ' + error.message);
  }
};

