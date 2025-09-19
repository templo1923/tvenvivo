// js/share.js

function setupShareFunctionality() {
  const shareButton = document.getElementById('share-channel-btn');
  const shareModal = document.getElementById('share-modal');
  const shareUrlInput = document.getElementById('share-url');
  const copyShareUrlButton = document.getElementById('copy-share-url');
  const closeShareModal = document.getElementById('close-share-modal');
  const socialShareButtons = document.querySelectorAll('.social-share-btn');

  shareButton.addEventListener('click', () => {
    if (!window.currentChannel) {
      showToast('Selecciona un canal primero para compartir');
      return;
    }

    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?channel=${encodeURIComponent(window.currentChannel.name)}&category=${encodeURIComponent(window.currentChannel.description)}`;

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

  socialShareButtons.forEach(button => {
    button.addEventListener('click', () => {
      const platform = button.dataset.platform;
      shareOnPlatform(platform, shareUrlInput.value, window.currentChannel.name);
    });
  });

  shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) {
      shareModal.classList.remove('active');
    }
  });
}

function shareOnPlatform(platform, url, channelName) {
  let shareUrl = '';

  switch (platform) {
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

window.setupShareFunctionality = setupShareFunctionality;
window.shareOnPlatform = shareOnPlatform;
