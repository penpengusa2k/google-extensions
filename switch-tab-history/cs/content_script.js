const OVERLAY_ID = "history-tabs-palette-overlay";
const PALETTE_ID = "history-tabs-palette-iframe";

function removePalette() {
  const existingOverlay = document.getElementById(OVERLAY_ID);
  if (existingOverlay) {
    existingOverlay.remove();
  }
}

function createOverlay() {
  if (!document.body) {
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        createOverlay();
      },
      { once: true }
    );
    return;
  }

  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    backdrop-filter: blur(1px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
  `;

  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay) {
      removePalette();
    }
  });

  const iframe = document.createElement("iframe");
  iframe.id = PALETTE_ID;
  iframe.src = chrome.runtime.getURL("ui/palette.html");
  iframe.setAttribute("allow", "clipboard-read; clipboard-write");
  iframe.style.cssText = `
    width: 750px;
    max-width: calc(100% - 32px);
    height: 500px;
    max-height: calc(100% - 32px);
    border: none;
    border-radius: 12px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.28);
    overflow: hidden;
    background: transparent;
  `;

  iframe.addEventListener("load", () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.postMessage({ type: "focusInput" }, "*");
      } catch (_) {
        /* noop */
      }
    }, 50);
  });

  overlay.appendChild(iframe);
  document.body.appendChild(overlay);
}

function togglePalette() {
  if (document.getElementById(OVERLAY_ID)) {
    removePalette();
  } else {
    createOverlay();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "togglePalette") {
    togglePalette();
    sendResponse({ ok: true });
  }
  return true;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    removePalette();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    removePalette();
  }
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "closePalette") {
    removePalette();
  }
});
