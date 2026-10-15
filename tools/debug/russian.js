await new Promise(r => setTimeout(r, 4000));
const attr = (id, a) => document.getElementById(id)?.getAttribute(a);
const node = document.getElementById("patrium-tor-button");
PanelUI.showSubView("patrium-tor-panel", node);
await new Promise(r => setTimeout(r, 1500));
const view = document.getElementById("patrium-tor-panel");
return {
  appLocale: Services.locale.appLocaleAsBCP47,
  appName: Services.appinfo.name,
  adblockTooltip: attr("patrium-adblock-button", "tooltiptext"),
  torLabel: attr("patrium-tor-button", "label"),
  zapretTooltip: attr("patrium-zapret-button", "tooltiptext"),
  torPanelTitle: view?.getAttribute("title"),
  torInstallButton: view?.querySelector("#patrium-tor-install")?.getAttribute("label"),
  torStatus: view?.querySelector("#patrium-tor-status")?.textContent,
  reloadTooltip: attr("reload-button", "tooltiptext"),
  urlbarPlaceholder: document.getElementById("urlbar-input")?.placeholder,
};
