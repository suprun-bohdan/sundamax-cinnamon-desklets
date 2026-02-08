const Desklet = imports.ui.desklet;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Pango = imports.gi.Pango;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

imports.searchPath.unshift(GLib.get_home_dir() + "/.local/share/cinnamon/desklets");
const DeskletWrapper = imports.sundamaxCommon.deskletWrapper;
const Settings = imports.ui.settings;
const Gettext = imports.gettext;
const Lang = imports.lang;

const UUID = "currencyRates@sundamax";
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest";
const NBU_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json";
const UAH_BRIDGE_CURRENCY = "USD";

const CURRENCY_FLAGS = {
    USD: "\u{1F1FA}\u{1F1F8}",
    EUR: "\u{1F1EA}\u{1F1FA}",
    GBP: "\u{1F1EC}\u{1F1E7}",
    PLN: "\u{1F1F5}\u{1F1F1}",
    CHF: "\u{1F1E8}\u{1F1ED}",
    CZK: "\u{1F1E8}\u{1F1FF}",
    SEK: "\u{1F1F8}\u{1F1EA}",
    NOK: "\u{1F1F3}\u{1F1F4}",
    DKK: "\u{1F1E9}\u{1F1F0}",
    CAD: "\u{1F1E8}\u{1F1E6}",
    AUD: "\u{1F1E6}\u{1F1FA}",
    JPY: "\u{1F1EF}\u{1F1F5}",
    CNY: "\u{1F1E8}\u{1F1F3}",
    INR: "\u{1F1EE}\u{1F1F3}",
    ISK: "\u{1F1EE}\u{1F1F8}",
    TRY: "\u{1F1F9}\u{1F1F7}",
    RUB: "\u{1F1F7}\u{1F1FA}",
    BRL: "\u{1F1E7}\u{1F1F7}",
    MXN: "\u{1F1F2}\u{1F1FD}",
    ZAR: "\u{1F1FF}\u{1F1E6}",
    UAH: "\u{1F1FA}\u{1F1E6}"
};

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

function getFlag(code) {
    return CURRENCY_FLAGS[code] || code;
}

function parseFrankfurter(data) {
    try {
        const obj = JSON.parse(data);
        return {
            base: obj.base || "USD",
            rates: obj.rates || {}
        };
    } catch (e) {
        global.logError("CurrencyRates parseFrankfurter: " + e.message);
        return { base: "USD", rates: {} };
    }
}

function parseNBU(data) {
    try {
        const arr = JSON.parse(data);
        const rates = {};
        if (Array.isArray(arr)) {
            for (let i = 0; i < arr.length; i++) {
                const item = arr[i];
                if (item && item.cc && typeof item.rate === "number") {
                    rates[item.cc] = item.rate;
                }
            }
        }
        return rates;
    } catch (e) {
        global.logError("CurrencyRates parseNBU: " + e.message);
        return {};
    }
}

function formatRate(rate) {
    if (!rate || !isFinite(rate)) return "—";
    if (rate >= 1000) return rate.toFixed(0);
    if (rate >= 1) return rate.toFixed(2);
    if (rate >= 0.01) return rate.toFixed(4);
    return rate.toFixed(6);
}

function CurrencyRatesDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

CurrencyRatesDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.setHeader(_("Currency Rates"));
        this._header_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], deskletId);
        this.theme = this.settings.getValue("theme") || "dark";
        this.baseCurrency = this.settings.getValue("baseCurrency") || "USD";
        this.spread = this.settings.getValue("spread") || "1";
        this.updateInterval = parseInt(this.settings.getValue("updateInterval"), 10) || 60;
        this.widthPercent = parseInt(this.settings.getValue("widthPercent"), 10) || 10;
        this.currency1 = this.settings.getValue("currency1") || "USD";
        this.currency2 = this.settings.getValue("currency2") || "EUR";
        this.currency3 = this.settings.getValue("currency3") || "PLN";
        this.currency4 = this.settings.getValue("currency4") || "PLN";
        this.currency5 = this.settings.getValue("currency5") || "CHF";

        const boundSettings = ["theme", "baseCurrency", "spread", "updateInterval", "widthPercent", "currency1", "currency2", "currency3", "currency4", "currency5"];
        boundSettings.forEach(key => {
            this.settings.bindProperty(Settings.BindingDirection.IN, key, key, this.on_settings_changed, null);
        });

        this.rates = {};
        this.base = "USD";
        this._timeout = null;

        this._buildUI();
        this._fetchRates();
        this._scheduleNextFetch();
    },

    _buildUI: function () {
        this.container = new St.BoxLayout({ vertical: true, style_class: "currency-desklet-container", x_align: Clutter.ActorAlign.FILL });
        this.titleLabel = new St.Label({
            text: _("Currency Rates"),
            style_class: "currency-desklet-title",
            x_align: Clutter.ActorAlign.CENTER
        });
        this._applyTitleStyle();
        this.titleLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        this.container.add_child(this.titleLabel);

        this.ratesContainer = new St.BoxLayout({ vertical: true, x_expand: true, x_align: Clutter.ActorAlign.FILL });
        this.container.add_child(this.ratesContainer);

        this.setContent(this.container);
        this._applyWidth();
    },

    _getWidthPx: function () {
        try {
            const monitor = Main.layoutManager.primaryMonitor;
            const screenWidth = monitor ? monitor.width : 1920;
            const percent = Math.max(5, Math.min(30, parseInt(this.widthPercent, 10) || 10));
            return Math.max(200, Math.round(screenWidth * percent / 100));
        } catch (e) {
            return 200;
        }
    },

    _applyWidth: function () {
        const w = this._getWidthPx();
        DeskletWrapper.applyWrapperLayout(this, w);
        if (this.container) {
            DeskletWrapper.applyContainerLayout(this.container, w);
        }
        if (this.ratesContainer) {
            DeskletWrapper.applyContainerLayout(this.ratesContainer, w);
        }
    },

    _getRatesWithSpread: function (mid, invert) {
        if (!mid || !isFinite(mid) || mid <= 0) return { buy: null, sell: null };
        const rate = invert !== false ? (1 / mid) : mid;
        const spreadVal = parseFloat(this.spread) || 0;
        const spread = spreadVal / 100;
        return {
            buy: rate * (1 + spread / 2),
            sell: rate * (1 - spread / 2)
        };
    },

    _addTableRow: function (container, col1, col2, col3, isHeader) {
        const row = new St.BoxLayout({ vertical: false, style_class: "currency-table-row", x_expand: true, x_align: Clutter.ActorAlign.FILL });
        const cellClass = isHeader ? "currency-table-header" : "currency-table-cell";
        const c1 = new St.Label({ text: col1, style_class: cellClass + " currency-table-col-flag" });
        const c2 = new St.Label({ text: col2, style_class: cellClass + " currency-table-col-buy", x_expand: true });
        const c3 = new St.Label({ text: col3, style_class: cellClass + " currency-table-col-sell", x_expand: true });
        c2.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        c3.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        row.add_child(c1);
        row.add_child(c2);
        row.add_child(c3);
        container.add_child(row);
    },

    _fetchRates: function () {
        const currencies = [this.currency1, this.currency2, this.currency3, this.currency4, this.currency5].filter(Boolean);
        const baseIsUah = this.baseCurrency === "UAH";
        const hasUahTarget = currencies.indexOf("UAH") >= 0;

        if (baseIsUah) {
            this._fetchRatesBaseUAH(currencies);
            return;
        }

        if (!hasUahTarget) {
            this._fetchFrankfurter(currencies, null);
            return;
        }

        this._fetchNBU(Lang.bind(this, function (nbuRates) {
            const frankfurterSymbols = currencies.filter(function (c) { return c !== "UAH"; });
            let uahRate = nbuRates[this.baseCurrency];
            const nbuUsd = nbuRates[UAH_BRIDGE_CURRENCY];
            const needBridgeForUah = !uahRate && nbuUsd;

            if (frankfurterSymbols.length === 0) {
                if (needBridgeForUah) {
                    this._fetchUAHViaBridge(nbuUsd, function (rate) {
                        this.rates = { UAH: rate };
                        this.base = this.baseCurrency;
                        this._refreshRates();
                        this._scheduleNextFetch();
                    });
                } else {
                    this.rates = { UAH: uahRate || null };
                    this.base = this.baseCurrency;
                    this._refreshRates();
                    this._scheduleNextFetch();
                }
                return;
            }

            const hasUsdInTargets = frankfurterSymbols.indexOf(UAH_BRIDGE_CURRENCY) >= 0;
            const symbolsForFrank = needBridgeForUah && !hasUsdInTargets
                ? frankfurterSymbols.concat(UAH_BRIDGE_CURRENCY)
                : frankfurterSymbols;
            this._fetchFrankfurter(symbolsForFrank, function (frankRates) {
                if (uahRate && frankRates) {
                    frankRates["UAH"] = uahRate;
                } else if (needBridgeForUah && frankRates) {
                    const baseToUsd = frankRates[UAH_BRIDGE_CURRENCY];
                    if (baseToUsd && isFinite(baseToUsd)) {
                        frankRates["UAH"] = baseToUsd * nbuUsd;
                    }
                }
                if (!hasUsdInTargets && frankRates) {
                    delete frankRates[UAH_BRIDGE_CURRENCY];
                }
                return frankRates;
            });
        }));
    },

    _fetchFrankfurter: function (symbols, mergeCallback, retryAttempt) {
        retryAttempt = retryAttempt || 0;
        const symbolsStr = symbols.join(",");
        const url = FRANKFURTER_URL + "?base=" + encodeURIComponent(this.baseCurrency) + "&symbols=" + encodeURIComponent(symbolsStr);
        const file = Gio.File.new_for_uri(url);

        file.load_contents_async(null, Lang.bind(this, function (file, res) {
            try {
                const [ok, contents] = file.load_contents_finish(res);
                if (!ok) {
                    if (retryAttempt < 2) {
                        const delaySec = 5 * (retryAttempt + 1);
                        Mainloop.timeout_add_seconds(delaySec, Lang.bind(this, function () {
                            this._fetchFrankfurter(symbols, mergeCallback, retryAttempt + 1);
                            return false;
                        }));
                    } else {
                        this._showError();
                        this._scheduleNextFetch();
                    }
                    return;
                }
                let data = (typeof imports.byteArray !== "undefined") ? imports.byteArray.toString(contents) : contents.toString();
                const parsed = parseFrankfurter(data);
                this.rates = mergeCallback ? mergeCallback(parsed.rates) : parsed.rates;
                this.base = parsed.base;
                this._refreshRates();
            } catch (e) {
                global.logError("CurrencyRates fetch: " + e.message);
                if (retryAttempt < 2) {
                    const delaySec = 5 * (retryAttempt + 1);
                    Mainloop.timeout_add_seconds(delaySec, Lang.bind(this, function () {
                        this._fetchFrankfurter(symbols, mergeCallback, retryAttempt + 1);
                        return false;
                    }));
                } else {
                    this._showError();
                    this._scheduleNextFetch();
                }
                return;
            }
            this._scheduleNextFetch();
        }));
    },

    _fetchRatesBaseUAH: function (currencies) {
        const self = this;
        this._fetchNBU(function (nbuRates) {
            const usdRate = nbuRates[UAH_BRIDGE_CURRENCY];
            const direct = {};
            const missing = [];
            for (let i = 0; i < currencies.length; i++) {
                const code = currencies[i];
                const rate = nbuRates[code];
                if (rate && isFinite(rate)) {
                    direct[code] = rate;
                } else {
                    missing.push(code);
                }
            }
            self.rates = direct;
            self.base = "UAH";

            if (missing.length === 0 || !usdRate) {
                self._refreshRates();
                self._scheduleNextFetch();
                return;
            }

            const url = FRANKFURTER_URL + "?base=" + UAH_BRIDGE_CURRENCY + "&symbols=" + encodeURIComponent(missing.join(","));
            const file = Gio.File.new_for_uri(url);
            self._fetchFrankfurterBridge(url, missing, usdRate, 0, function () {
                self._refreshRates();
                self._scheduleNextFetch();
            });
        });
    },

    _fetchFrankfurterBridge: function (url, missing, usdRate, retryAttempt, doneCallback) {
        const self = this;
        const file = Gio.File.new_for_uri(url);
        file.load_contents_async(null, Lang.bind(this, function (f, res) {
            try {
                const [ok, contents] = file.load_contents_finish(res);
                if (!ok) {
                    if (retryAttempt < 2) {
                        const delaySec = 5 * (retryAttempt + 1);
                        Mainloop.timeout_add_seconds(delaySec, Lang.bind(this, function () {
                            this._fetchFrankfurterBridge(url, missing, usdRate, retryAttempt + 1, doneCallback);
                            return false;
                        }));
                    } else {
                        doneCallback();
                    }
                    return;
                }
                let data = (typeof imports.byteArray !== "undefined") ? imports.byteArray.toString(contents) : contents.toString();
                const parsed = parseFrankfurter(data);
                const frankRates = parsed.rates || {};
                for (let j = 0; j < missing.length; j++) {
                    const code = missing[j];
                    const frankRate = frankRates[code];
                    if (frankRate && isFinite(frankRate) && frankRate > 0) {
                        self.rates[code] = usdRate / frankRate;
                    }
                }
            } catch (e) {
                global.logError("CurrencyRates UAH bridge: " + e.message);
            }
            doneCallback();
        }));
    },

    _fetchUAHViaBridge: function (nbuUsd, doneCallback) {
        const url = FRANKFURTER_URL + "?base=" + encodeURIComponent(this.baseCurrency) + "&symbols=" + UAH_BRIDGE_CURRENCY;
        const file = Gio.File.new_for_uri(url);
        file.load_contents_async(null, Lang.bind(this, function (f, res) {
            let rate = null;
            try {
                const [ok, contents] = file.load_contents_finish(res);
                if (ok) {
                    let data = (typeof imports.byteArray !== "undefined") ? imports.byteArray.toString(contents) : contents.toString();
                    const parsed = parseFrankfurter(data);
                    const baseToUsd = parsed.rates && parsed.rates[UAH_BRIDGE_CURRENCY];
                    if (baseToUsd && isFinite(baseToUsd)) {
                        rate = baseToUsd * nbuUsd;
                    }
                }
            } catch (e) {
                global.logError("CurrencyRates UAH bridge: " + e.message);
            }
            doneCallback.call(this, rate);
        }));
    },

    _fetchNBU: function (callback, retryAttempt) {
        retryAttempt = retryAttempt || 0;
        const file = Gio.File.new_for_uri(NBU_URL);
        file.load_contents_async(null, Lang.bind(this, function (f, res) {
            try {
                const [ok, contents] = file.load_contents_finish(res);
                if (!ok) {
                    if (retryAttempt < 2) {
                        const delaySec = 5 * (retryAttempt + 1);
                        Mainloop.timeout_add_seconds(delaySec, Lang.bind(this, function () {
                            this._fetchNBU(callback, retryAttempt + 1);
                            return false;
                        }));
                    } else {
                        callback({});
                    }
                    return;
                }
                let data = (typeof imports.byteArray !== "undefined") ? imports.byteArray.toString(contents) : contents.toString();
                callback(parseNBU(data));
            } catch (e) {
                global.logError("CurrencyRates NBU: " + e.message);
                if (retryAttempt < 2) {
                    const delaySec = 5 * (retryAttempt + 1);
                    Mainloop.timeout_add_seconds(delaySec, Lang.bind(this, function () {
                        this._fetchNBU(callback, retryAttempt + 1);
                        return false;
                    }));
                } else {
                    callback({});
                }
            }
        }));
    },

    _refreshRates: function () {
        while (this.ratesContainer.get_n_children() > 0) {
            this.ratesContainer.remove_child(this.ratesContainer.get_child_at_index(0));
        }

        const currencies = [this.currency1, this.currency2, this.currency3, this.currency4, this.currency5].filter(Boolean);
        const hasData = Object.keys(this.rates).length > 0;

        if (!hasData) {
            const err = new St.Label({
                text: _("No data"),
                style_class: "currency-table-cell"
            });
            this.ratesContainer.add_child(err);
            return;
        }

        const localCode = this.base || this.baseCurrency;
        const baseIsUah = localCode === "UAH";
        const tableClass = this.theme === "light" ? "currency-table-light" : "currency-table-dark";

        const table = new St.BoxLayout({ vertical: true, style_class: "currency-table " + tableClass, x_expand: true });
        table.set_opacity(0);
        this._addTableRow(table, "", _("Buy"), _("Sell"), true);
        for (let i = 0; i < currencies.length; i++) {
            const code = currencies[i];
            const mid = this.rates[code];
            const invert = !baseIsUah;
            const rates = this._getRatesWithSpread(mid, invert);
            const buyStr = rates.buy ? formatRate(rates.buy) : "—";
            const sellStr = rates.sell ? formatRate(rates.sell) : "—";
            this._addTableRow(table, getFlag(code), buyStr, sellStr, false);
        }
        this.ratesContainer.add_child(table);
        table.ease({
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            opacity: 255
        });
    },

    _showError: function () {
        this.rates = {};
        this._refreshRates();
    },

    _applyTitleStyle: function () {
        if (!this.titleLabel) return;
        const color = this.theme === "light" ? "#1a1a1a" : "#e5e5e5";
        this.titleLabel.set_style("font-size: 13px; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 10px; color: " + color + ";");
    },

    on_settings_changed: function () {
        this.theme = this.settings.getValue("theme") || "dark";
        this.baseCurrency = this.settings.getValue("baseCurrency") || "USD";
        this.spread = this.settings.getValue("spread") || "1";
        this.updateInterval = parseInt(this.settings.getValue("updateInterval"), 10) || 60;
        this.widthPercent = parseInt(this.settings.getValue("widthPercent"), 10) || 10;
        this.currency1 = this.settings.getValue("currency1") || "USD";
        this.currency2 = this.settings.getValue("currency2") || "EUR";
        this.currency3 = this.settings.getValue("currency3") || "PLN";
        this.currency4 = this.settings.getValue("currency4") || "PLN";
        this.currency5 = this.settings.getValue("currency5") || "CHF";

        this._applyWidth();

        if (this.titleLabel) {
            this.titleLabel.set_text(_("Currency Rates"));
            this._applyTitleStyle();
        }
        this._fetchRates();
        this._refreshRates();
        this._scheduleNextFetch();
    },

    on_desklet_added_to_desktop: function () {
        this._scheduleNextFetch();
    },

    _scheduleNextFetch: function () {
        if (this._timeout) Mainloop.source_remove(this._timeout);
        const intervalSec = Math.max(1, parseInt(this.updateInterval, 10) || 60);
        this._timeout = Mainloop.timeout_add_seconds(intervalSec, Lang.bind(this, function () {
            this._fetchRates();
            return true;
        }));
    },

    on_desklet_removed: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
    }
};

function main(metadata, deskletId) {
    return new CurrencyRatesDesklet(metadata, deskletId);
}
