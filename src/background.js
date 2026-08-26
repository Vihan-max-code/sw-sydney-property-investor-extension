// ─── Background Service Worker ────────────────────────────────────────────────
// Routes API calls from content script to the backend.
// Content scripts on HTTPS pages can't call HTTP localhost directly.

let API_BASE = "http://localhost:3001";

// Load saved API URL
chrome.storage.local.get("apiBase", (data) => {
  if (data.apiBase) API_BASE = data.apiBase;
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiBase) API_BASE = changes.apiBase.newValue || "http://localhost:3001";
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === "getSuburb") {
    const slug = msg.name.replace(/\s+/g, "-");
    fetch(`${API_BASE}/api/suburb/${slug}?postcode=${msg.postcode || ""}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => sendResponse({ data }))
      .catch(err => {
        console.log("[BG] getSuburb error:", err.message);
        sendResponse({ data: null, error: err.message });
      });
    return true; // Keep channel open for async response
  }

  if (msg.action === "analyse") {
    fetch(`${API_BASE}/api/analyse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.payload)
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => sendResponse({ data }))
      .catch(err => {
        console.log("[BG] analyse error:", err.message);
        sendResponse({ data: null, error: err.message });
      });
    return true;
  }

  if (msg.action === "healthCheck") {
    fetch(`${API_BASE}/api/health`)
      .then(r => r.json())
      .then(data => sendResponse({ data }))
      .catch(err => sendResponse({ data: null, error: err.message }));
    return true;
  }

  if (msg.action === "getSuburbs") {
    fetch(`${API_BASE}/api/suburbs`)
      .then(r => r.json())
      .then(data => sendResponse({ data }))
      .catch(err => sendResponse({ data: null, error: err.message }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[BG] SW Sydney Property Investor installed");
});
