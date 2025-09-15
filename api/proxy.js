// /api/proxy.js
const fetch = require('node-fetch');

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
    
    // Verificar que la URL sea HTTP (no HTTPS)
    if (decodedUrl.startsWith('https://')) {
      return res.status(400).send('El proxy solo funciona con URLs HTTP');
    }

    const response = await fetch(decodedUrl, {
      headers: {
        'Referer': req.headers['referer'] || 'https://tu-dominio.vercel.app/',
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
      },
      timeout: 10000, // 10 segundos de timeout
    });

    if (!response.ok) {
      return res.status(response.status).send(`Error ${response.status}: ${response.statusText}`);
    }
    
    // Copiar las cabeceras importantes del stream original
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    // Configurar headers de caching
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    
    // Pipe la respuesta
    response.body.pipe(res);

  } catch (error) {
    console.error('Error en el proxy:', error);
    res.status(500).send('Error al contactar el servidor de streaming: ' + error.message);
  }
};
