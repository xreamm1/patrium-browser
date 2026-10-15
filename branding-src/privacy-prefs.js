/* Patrium privacy defaults. Appended to the branding pref file. */

// Telemetry & data reporting
pref("datareporting.healthreport.uploadEnabled", false);
pref("datareporting.policy.dataSubmissionEnabled", false);
pref("datareporting.usage.uploadEnabled", false);
pref("toolkit.telemetry.enabled", false);
pref("toolkit.telemetry.unified", false);
pref("toolkit.telemetry.archive.enabled", false);
pref("toolkit.telemetry.newProfilePing.enabled", false);
pref("toolkit.telemetry.shutdownPingSender.enabled", false);
pref("toolkit.telemetry.updatePing.enabled", false);
pref("toolkit.telemetry.bhrPing.enabled", false);
pref("toolkit.telemetry.firstShutdownPing.enabled", false);
pref("browser.ping-centre.telemetry", false);
pref("browser.newtabpage.activity-stream.feeds.telemetry", false);
pref("browser.newtabpage.activity-stream.telemetry", false);

// Studies, experiments, remote recommendations
pref("app.shield.optoutstudies.enabled", false);
pref("app.normandy.enabled", false);
pref("app.normandy.api_url", "");
pref("messaging-system.rsexperimentloader.enabled", false);
pref("nimbus.rollouts.enabled", false);
pref("browser.discovery.enabled", false);
pref("extensions.htmlaboutaddons.recommendations.enabled", false);
pref("extensions.getAddons.showPane", false);
pref("browser.newtabpage.activity-stream.asrouter.userprefs.cfr.addons", false);
pref("browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features", false);

// Crash reports
pref("breakpad.reportURL", "");
pref("browser.tabs.crashReporting.sendReport", false);
pref("browser.crashReports.unsubmittedCheck.autoSubmit2", false);

// New tab: no sponsored content, no Pocket
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.showSponsoredCheckboxes", false);
pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
pref("browser.newtabpage.activity-stream.feeds.topsites", true);
pref("browser.newtabpage.activity-stream.default.sites", "");
pref("extensions.pocket.enabled", false);
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
pref("browser.urlbar.suggest.quicksuggest.nonsponsored", false);
pref("browser.urlbar.quicksuggest.enabled", false);

// Tracking protection on strict by default
pref("privacy.trackingprotection.enabled", true);
pref("privacy.trackingprotection.socialtracking.enabled", true);
pref("privacy.globalprivacycontrol.enabled", true);

// Misc
pref("browser.aboutConfig.showWarning", false);
pref("browser.shell.checkDefaultBrowser", false);
pref("browser.aboutwelcome.enabled", false);
pref("dom.private-attribution.submission.enabled", false);

// Patrium: extra privacy
pref("privacy.query_stripping.enabled", true);
pref("privacy.query_stripping.enabled.pbmode", true);
pref("network.http.referer.XOriginTrimmingPolicy", 2);
pref("network.trr.mode", 2);
pref("browser.ipProtection.enabled", false);
pref("browser.sessionstore.interval", 60000);

// Patrium features
pref("patrium.adblock.enabled", true);
pref("patrium.adblock.allowlist", "");
pref("patrium.zapret.strategy", "general.bat");
pref("patrium.tor.bridges", "snowflake");
pref("patrium.tor.socksPort", 9350);

// Patrium: memory
pref("patrium.memory.tabUnload.enabled", true);
pref("patrium.memory.tabUnloadMinutes", 30);
pref("patrium.memory.saver", false);
pref("dom.ipc.processCount.webIsolated", 1);
pref("dom.ipc.processPrelaunch.enabled", false);
pref("browser.sessionhistory.max_total_viewers", 2);
pref("image.mem.surfacecache.max_size_kb", 524288);
pref("browser.tabs.unloadOnLowMemory", true);

// Patrium: updates (GitHub releases of patrium.update.repo, e.g. "owner/patrium")
pref("patrium.version", "0.1.1");
pref("patrium.update.enabled", true);
pref("patrium.update.repo", "xreamm1/patrium-browser");

// Patrium: GitHub repo pinned as a default new-tab tile
pref("browser.newtabpage.pinned", "[{\"url\":\"https://github.com/xreamm1/patrium-browser\",\"label\":\"Patrium on GitHub\"}]");
