const { PatriumAdblock } = ChromeUtils.importESModule(
  "moz-src:///browser/components/patrium/PatriumAdblock.sys.mjs");
const start = Date.now();
while (PatriumAdblock.enabled && !PatriumAdblock.ready && Date.now() - start < 180000) {
  await new Promise(r => setTimeout(r, 500));
}
const sites = [
  "https://lenta.ru/",
  "https://ria.ru/",
  "https://www.rbc.ru/",
  "https://habr.com/ru/feed/",
  "https://ru.wikipedia.org/wiki/Firefox",
  "https://www.youtube.com/",
  "https://www.ixbt.com/",
  "https://www.gismeteo.ru/",
];
const principal = Services.scriptSecurityManager.getSystemPrincipal();
gBrowser.selectedBrowser.fixupAndLoadURIString(sites[0], { triggeringPrincipal: principal });
for (const url of sites.slice(1)) {
  gBrowser.addTab(url, { triggeringPrincipal: principal, inBackground: true });
  await new Promise(r => setTimeout(r, 1500));
}
await new Promise(r => setTimeout(r, 30000));
Cu.forceGC();
Cu.forceCC();
await new Promise(r => setTimeout(r, 5000));
const info = await ChromeUtils.requestProcInfo();
const procs = [info, ...info.children];
const mb = b => Math.round(b / 1024 / 1024);
return {
  adblock: PatriumAdblock.enabled,
  processes: procs.length,
  totalMB: mb(procs.reduce((s, p) => s + p.memory, 0)),
  byType: Object.entries(
    procs.reduce((acc, p) => {
      acc[p.type] = (acc[p.type] ?? 0) + p.memory;
      return acc;
    }, {})
  ).map(([t, b]) => `${t}: ${mb(b)} MB`),
  blockedTotal: gBrowser.browsers.reduce((s, b) => s + PatriumAdblock.getBlockedCount(b), 0),
};
