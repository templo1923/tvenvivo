// /api/proxy.js

const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('Falta el parámetro "url"');
  }

  try {
    const response = await fetch(decodeURIComponent(url), {
      headers: {
        'Referer': req.headers['referer'] || 'https://quezalmaik.vercel.app/',
        'User-Agent': req.headers['user-agent'],
      },
    });

    if (!response.ok) {
      return res.status(response.status).send(response.statusText);
    }
    
    // Copiar las cabeceras importantes del stream original a nuestra respuesta
    res.setHeader('Content-Type', response.headers.get('content-type'));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); // Caché de 1 minuto

    response.body.pipe(res);

  } catch (error) {
    console.error('Error en el proxy:', error);
    res.status(500).send('Error al contactar el servidor de streaming.');
  }
};