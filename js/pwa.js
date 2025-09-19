// js/pwa.js

let deferredPrompt = null;

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

function checkIfAppIsInstalled() {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    document.body.classList.add('pwa-installed');
    console.log('La aplicación está ejecutándose como PWA instalada');
  }

  window.matchMedia('(display-mode: standalone)').addListener((e) => {
    document.body.classList.toggle('pwa-installed', e.matches);
  });
}

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

async function initPWA() {
  await registerServiceWorker();
  checkIfAppIsInstalled();
  setupInstallPrompt();
  setupOnlineOfflineDetection();
}

window.initPWA = initPWA;
