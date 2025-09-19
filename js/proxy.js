// js/proxy.js

const PROXY_SERVERS = [
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://cors-anywhere.herokuapp.com/',
  'https://proxy.cors.sh/'
];

let currentProxyIndex = 0;

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

function rotateProxy() {
  currentProxyIndex = (currentProxyIndex + 1) % PROXY_SERVERS.length;
  console.log(`Cambiando a proxy: ${PROXY_SERVERS[currentProxyIndex]}`);
}

window.getProxiedUrl = getProxiedUrl;
window.rotateProxy = rotateProxy;
