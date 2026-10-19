chrome.action.onClicked.addListener((tab) => {
  if (tab?.windowId) chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'open-side-panel' && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
  }
});
