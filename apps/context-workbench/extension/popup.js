const tabsEl = document.querySelector("#tabs");
const statusEl = document.querySelector("#status");
const appUrlEl = document.querySelector("#appUrl");

function safeHttp(url) {
  return /^https?:/i.test(url || "");
}

async function load() {
  const saved = await chrome.storage.local.get(["appUrl"]);
  if (saved.appUrl) appUrlEl.value = saved.appUrl;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  tabsEl.innerHTML = tabs
    .filter((t) => safeHttp(t.url))
    .map((t, index) => `
      <label class="tab">
        <input type="checkbox" data-tab="${t.id}" ${index < 3 ? "checked" : ""}>
        <span style="min-width:0">
          <div class="title">${escapeHtml(t.title || "Untitled")}</div>
          <div class="url">${escapeHtml(t.url || "")}</div>
        </span>
      </label>`).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

async function readTab(tabId) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      title: document.title,
      url: location.href,
      text: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 6000)
    })
  });
  return result?.[0]?.result;
}

document.querySelector("#capture").addEventListener("click", async () => {
  const selected = [...document.querySelectorAll("input[data-tab]:checked")].map((x) => Number(x.dataset.tab));
  if (!selected.length) return statusEl.textContent = "Select at least one tab.";
  const appUrl = appUrlEl.value.trim().replace(/\/+$/, "");
  await chrome.storage.local.set({ appUrl });
  statusEl.textContent = "Capturing selected tabs…";
  const sources = [];
  for (const id of selected) {
    try {
      const source = await readTab(id);
      if (source) sources.push({ ...source, kind: /chatgpt|claude/i.test(source.url) ? "ai-chat" : "web-tab" });
    } catch (error) {
      console.warn("Capture failed", id, error);
    }
  }
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ version: 1, sources }))));
  await chrome.tabs.create({ url: `${appUrl}/#capture=${encodeURIComponent(payload)}` });
  window.close();
});

load();
