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

const UUID = "serverPing@sundamax";

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

function parseTargetsLegacy(str) {
    if (!str || typeof str !== "string") return [];
    const raw = str.split(/[\n,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    const result = [];
    for (let i = 0; i < raw.length; i++) {
        let host, port;
        const s = raw[i];
        if (s.charAt(0) === "[") {
            const end = s.indexOf("]:");
            if (end > 0) {
                host = s.substring(1, end);
                port = parseInt(s.substring(end + 2).trim(), 10);
            }
        } else {
            const parts = s.split(":");
            if (parts.length >= 2) {
                port = parseInt(parts[parts.length - 1].trim(), 10);
                host = parts.slice(0, -1).join(":").trim();
            }
        }
        if (host && !isNaN(port) && port > 0 && port <= 65535) {
            result.push({ host: host, port: port, label: host + ":" + port });
        }
    }
    return result;
}

function normalizeTargets(val) {
    if (Array.isArray(val) && val.length > 0) {
        return val.map(function (row) {
            const host = (row.host || "").toString().trim();
            const port = parseInt(row.port, 10);
            if (host && !isNaN(port) && port > 0 && port <= 65535) {
                return { host: host, port: port, label: host + ":" + port };
            }
            return null;
        }).filter(Boolean);
    }
    if (typeof val === "string" && val.length > 0) {
        return parseTargetsLegacy(val);
    }
    return [];
}

function ServerPingDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

ServerPingDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.actor.set_style("background-color: transparent;");

        this.setHeader(_("Server Ping"));
        this._header_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], deskletId);
        this.theme = this.settings.getValue("theme") || "dark";
        this.widthPercent = parseInt(this.settings.getValue("widthPercent"), 10) || 10;
        this.updateInterval = Math.max(1, parseInt(this.settings.getValue("updateInterval"), 10) || 30);
        this.timeoutSec = Math.max(2, Math.min(5, parseInt(this.settings.getValue("timeoutSec"), 10) || 3));

        const boundSettings = ["theme", "widthPercent", "targets", "updateInterval", "timeoutSec"];
        boundSettings.forEach(function (key) {
            this.settings.bindProperty(Settings.BindingDirection.IN, key, key, this.on_settings_changed, null);
        }, this);

        this._deskletPath = GLib.get_home_dir() + "/.local/share/cinnamon/desklets/" + this.metadata["uuid"] + "/";
        this._timeout = null;
        this._statusActors = [];

        this._buildUI();
        this._applyWidth();
        this._checkAll();
    },

    _buildUI: function () {
        this.container = new St.BoxLayout({ vertical: true, style_class: "serverping-desklet-container", x_align: Clutter.ActorAlign.FILL });
        this.titleLabel = new St.Label({
            text: _("Server Ping"),
            style_class: "serverping-desklet-title",
            x_align: Clutter.ActorAlign.CENTER
        });
        this._applyTitleStyle();
        this.titleLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        this.container.add_child(this.titleLabel);

        const panelClass = this.theme === "light" ? "serverping-panel-light" : "serverping-panel-dark";
        this.panel = new St.BoxLayout({ vertical: true, style_class: "serverping-panel " + panelClass, x_expand: true, x_align: Clutter.ActorAlign.FILL });
        this.panel.set_clip_to_allocation(true);
        this.container.add_child(this.panel);

        this.setContent(this.container);
    },

    _applyTitleStyle: function () {
        if (!this.titleLabel) return;
        const color = this.theme === "light" ? "#1a1a1a" : "#e5e5e5";
        this.titleLabel.set_style("font-size: 13px; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 8px; color: " + color + ";");
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
    },

    _refreshPanel: function () {
        while (this.panel.get_n_children() > 0) {
            this.panel.remove_child(this.panel.get_child_at_index(0));
        }
        this._statusActors = [];

        const targets = normalizeTargets(this.settings.getValue("targets"));
        if (targets.length === 0) {
            const empty = new St.Label({ text: _("Add host:port in settings"), style_class: "serverping-empty" });
            const color = this.theme === "light" ? "#666" : "#999";
            empty.set_style("color: " + color + "; font-size: 11px;");
            this.panel.add_child(empty);
            return;
        }

        const color = this.theme === "light" ? "#1a1a1a" : "#e5e5e5";
        for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            const row = new St.BoxLayout({ vertical: false, style_class: "serverping-row" });
            const dot = new St.BoxLayout({ style_class: "serverping-dot" });
            dot.set_style("min-width: 12px; min-height: 12px; width: 12px; height: 12px; border-radius: 6px; background-color: #666; margin-right: 10px;");
            const lbl = new St.Label({ text: t.label, style: "color: " + color + "; font-size: 11px;" });
            lbl.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            row.add_child(dot);
            row.add_child(lbl);
            this.panel.add_child(row);
            this._statusActors.push({ dot: dot, target: t });
        }
    },

    _checkOne: function (target, doneCallback) {
        const client = new Gio.SocketClient();
        client.set_timeout(this.timeoutSec);
        client.connect_to_host_async(target.host, target.port, null, Lang.bind(this, function (obj, res) {
            let ok = false;
            try {
                const conn = client.connect_to_host_finish(res);
                if (conn) {
                    conn.close(null);
                    ok = true;
                }
            } catch (e) {
                /* connection failed */
            }
            doneCallback(ok);
        }));
    },

    _checkAll: function () {
        const targets = normalizeTargets(this.settings.getValue("targets"));
        if (targets.length === 0) {
            this._refreshPanel();
            this._scheduleNext();
            return;
        }

        this._refreshPanel();
        if (this._statusActors.length === 0) {
            this._scheduleNext();
            return;
        }

        let pending = this._statusActors.length;
        const self = this;
        for (let i = 0; i < this._statusActors.length; i++) {
            const item = this._statusActors[i];
            this._checkOne(item.target, function (ok) {
                const color = ok ? "#22c55e" : "#ef4444";
                const shadow = ok ? "0 0 6px rgba(34,197,94,0.6)" : "0 0 6px rgba(239,68,68,0.5)";
                item.dot.set_style("min-width: 12px; min-height: 12px; width: 12px; height: 12px; border-radius: 6px; background-color: " + color + "; margin-right: 10px; box-shadow: " + shadow + ";");
                pending--;
                if (pending <= 0) self._scheduleNext();
            });
        }
    },

    _scheduleNext: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
        const interval = Math.max(1, parseInt(this.updateInterval, 10) || 30);
        this._timeout = Mainloop.timeout_add_seconds(interval, Lang.bind(this, function () {
            this._checkAll();
            return false;
        }));
    },

    on_settings_changed: function () {
        this.theme = this.settings.getValue("theme") || "dark";
        this.updateInterval = Math.max(1, parseInt(this.settings.getValue("updateInterval"), 10) || 30);
        this.timeoutSec = Math.max(2, Math.min(5, parseInt(this.settings.getValue("timeoutSec"), 10) || 3));

        const panelClass = this.theme === "light" ? "serverping-panel-light" : "serverping-panel-dark";
        this.panel.remove_style_class_name("serverping-panel-light");
        this.panel.remove_style_class_name("serverping-panel-dark");
        this.panel.add_style_class_name(panelClass);

        this._applyWidth();
        this._applyTitleStyle();
        this._checkAll();
    },

    on_desklet_removed: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
        this._statusActors = [];
    }
};

function main(metadata, deskletId) {
    return new ServerPingDesklet(metadata, deskletId);
}
