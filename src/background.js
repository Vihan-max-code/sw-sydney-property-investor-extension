let API_BASE = "https://sw-sydney-property-investor-api-production.up.railway.app";
chrome.storage.local.get("apiBase", (data) => { if (data.apiBase) API_BASE = data.apiBase; });
chrome.storage.onChanged.addListener((changes) => { if (changes.apiBase) API_BASE = changes.apiBase.newValue || "https://sw-sydney-property-investor-api-production.up.railway.app"; });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getSuburb") {
    const slug = msg.name.replace(/\s+/g, "-");
    fetch(`${API_BASE}/api/suburb/${slug}?postcode=${msg.postcode || ""}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => sendResponse({ data }))
      .catch(err => sendResponse({ data: null, error: err.message }));
    return true;
  }
  if (msg.action === "analyse") {
    fetch(`${API_BASE}/api/analyse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.payload)
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => sendResponse({ data }))
      .catch(err => sendResponse({ data: null, error: err.message }));
    return true;
  }
  if (msg.action === "healthCheck") {
    fetch(`${API_BASE}/api/health`).then(r => r.json()).then(data => sendResponse({ data })).catch(err => sendResponse({ data: null, error: err.message }));
    return true;
  }
  if (msg.action === "getSuburbs") {
    fetch(`${API_BASE}/api/suburbs`).then(r => r.json()).then(data => sendResponse({ data })).catch(err => sendResponse({ data: null, error: err.message }));
    return true;
  }
});
chrome.runtime.onInstalled.addListener(() => { console.log("[BG] SW Sydney Property Investor installed"); });
