const PALETTE_ID = 'history-tabs-palette-iframe';

function togglePalette() {
  const existing = document.getElementById(PALETTE_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.id = PALETTE_ID;
  iframe.src = chrome.runtime.getURL('ui/palette.html');
  iframe.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 750px;
    height: 500px;
    border: 1px solid #ccc;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    z-index: 999999;
  `;

  iframe.onload = () => {
    setTimeout(() => {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'focusInput' }, '*');
      }
    }, 100);
  };

  document.body.appendChild(iframe);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'togglePalette') {
    togglePalette();
    sendResponse({ ok: true });
  }
  return true;
});

// Close the palette when the Escape key is pressed
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const palette = document.getElementById(PALETTE_ID);
    if (palette) {
      palette.remove();
    }
  }
});

// Listen for messages from the iframe (e.g., to close itself)
window.addEventListener('message', (event) => {
  if (event.data?.type === 'closePalette') {
    const palette = document.getElementById(PALETTE_ID);
    if (palette) {
      palette.remove();
    }
  }
});
