// js/cache.js

let streamCache = JSON.parse(localStorage.getItem('streamCache')) || {};

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

function getFromStreamCache(url) {
  const cached = streamCache[url];
  if (cached && (Date.now() - cached.timestamp) < 3600000) {
    return cached.data;
  }
  return null;
}

window.addToStreamCache = addToStreamCache;
window.getFromStreamCache = getFromStreamCache;
