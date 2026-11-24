const STORAGE = 'eperjadinV2Pilot';

chrome.runtime.onInstalled.addListener(() => {
  // Do not carry persistent captures from older versions into session storage.
  chrome.storage.local.remove(STORAGE);
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.tab || !sender.url?.startsWith('https://satu.kemenkeu.go.id/')) return false;
  if (message?.type !== 'GET_COLLECTOR_STATE' && message?.type !== 'SET_COLLECTOR_STATE') return false;
  const work = message.type === 'GET_COLLECTOR_STATE'
    ? chrome.storage.session.get(STORAGE).then((data) => data[STORAGE] ?? null)
    : chrome.storage.session.set({ [STORAGE]: message.state }).then(() => null);
  work.then((data) => respond({ ok: true, data }), () => respond({ ok: false }));
  return true;
});
