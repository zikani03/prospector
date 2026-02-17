/**
 * Background service worker.
 * Relays messages between the DevTools panel and content scripts,
 * and stores page snapshots in chrome.storage.local.
 */

const panelPorts = new Map();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "prospector-panel") {
    const tabId = port.sender?.tab?.id;
    panelPorts.set(port, true);

    port.onMessage.addListener(async (message) => {
      if (message.type === "SCAN_PAGE") {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            port.postMessage({ type: "SCAN_ERROR", error: "No active tab found" });
            return;
          }

          const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_ELEMENTS" });
          if (response) {
            await storeSnapshot(response);
            port.postMessage({ type: "SCAN_RESULT", data: response });
          }
        } catch (err) {
          port.postMessage({ type: "SCAN_ERROR", error: err.message });
        }
      }

      if (message.type === "GET_SNAPSHOTS") {
        const snapshots = await getSnapshots();
        port.postMessage({ type: "SNAPSHOTS_LIST", data: snapshots });
      }

      if (message.type === "CLEAR_SNAPSHOTS") {
        await chrome.storage.local.set({ prospector_snapshots: [] });
        port.postMessage({ type: "SNAPSHOTS_LIST", data: [] });
      }
    });

    port.onDisconnect.addListener(() => {
      panelPorts.delete(port);
    });
  }
});

async function storeSnapshot(snapshot) {
  const result = await chrome.storage.local.get("prospector_snapshots");
  const snapshots = result.prospector_snapshots || [];
  snapshots.push(snapshot);
  // Keep at most 50 snapshots
  if (snapshots.length > 50) {
    snapshots.splice(0, snapshots.length - 50);
  }
  await chrome.storage.local.set({ prospector_snapshots: snapshots });
}

async function getSnapshots() {
  const result = await chrome.storage.local.get("prospector_snapshots");
  return result.prospector_snapshots || [];
}
