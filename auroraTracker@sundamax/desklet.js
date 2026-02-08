const Desklet = imports.ui.desklet;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Pango = imports.gi.Pango;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GdkPixbuf = imports.gi.GdkPixbuf;

imports.searchPath.unshift(GLib.get_home_dir() + "/.local/share/cinnamon/desklets");
const DeskletWrapper = imports.sundamaxCommon.deskletWrapper;
const Settings = imports.ui.settings;
const Gettext = imports.gettext;
const Lang = imports.lang;

const UUID = "auroraTracker@sundamax";
const AURORA_IMAGE_URL = "https://services.swpc.noaa.gov/images/aurora-forecast-northern-hemisphere.jpg";
const KP_API_URL = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json";
const RETRY_DELAY_SEC = 5;

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

function parseKpData(dataStr) {
    try {
        const arr = JSON.parse(dataStr);
        if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
        const item = arr[arr.length - 1];
        return {
            kp_index: typeof item.kp_index === "number" ? item.kp_index : null,
            estimated_kp: typeof item.estimated_kp === "number" ? item.estimated_kp : null,
            kp: item.kp || null,
            time_tag: item.time_tag || null
        };
    } catch (e) {
        global.logError("AuroraTracker parseKpData: " + e.message);
        return null;
    }
}

function formatKp(val) {
    if (val === null || !isFinite(val)) return "—";
    return val.toFixed(1);
}

function AuroraTrackerDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

AuroraTrackerDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.actor.set_style("background-color: transparent;");

        this.setHeader(_("Aurora Tracker"));
        this._header_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], deskletId);
        this.theme = this.settings.getValue("theme") || "dark";
        this.widthPercent = parseInt(this.settings.getValue("widthPercent"), 10) || 10;
        this.updateInterval = Math.max(5, parseInt(this.settings.getValue("updateInterval"), 10) || 5);
        this.showKp = this.settings.getValue("showKp") !== false;

        const boundSettings = ["theme", "widthPercent", "updateInterval", "showKp"];
        boundSettings.forEach(function (key) {
            this.settings.bindProperty(Settings.BindingDirection.IN, key, key, this.on_settings_changed, null);
        }, this);

        this._deskletPath = GLib.get_home_dir() + "/.local/share/cinnamon/desklets/" + this.metadata["uuid"] + "/";
        this._kpData = null;
        this._imageCacheTime = 0;
        this._imageWidth = null;
        this._imageHeight = null;
        this._timeout = null;
        this._fetchInProgress = false;

        this._buildUI();
        this._applyWidth();
        this._fetchAuroraImage();
    },

    _buildUI: function () {
        this.container = new St.BoxLayout({ vertical: true, style_class: "aurora-desklet-container", x_align: Clutter.ActorAlign.FILL });
        this.titleLabel = new St.Label({
            text: _("Aurora Tracker"),
            style_class: "aurora-desklet-title",
            x_align: Clutter.ActorAlign.CENTER
        });
        this._applyTitleStyle();
        this.titleLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        this.container.add_child(this.titleLabel);

        this.mapBin = new St.Bin({ x_expand: true, style_class: "aurora-map-container" });
        this.mapBin.set_child(new Clutter.Actor({ x_expand: true }));
        this.container.add_child(this.mapBin);

        const coordsClass = this.theme === "light" ? "aurora-coords-panel-light" : "aurora-coords-panel-dark";
        this.coordsPanel = new St.BoxLayout({ vertical: true, style_class: "aurora-coords-panel " + coordsClass, x_expand: true, x_align: Clutter.ActorAlign.FILL });
        this.coordsPanel.set_clip_to_allocation(true);
        this.container.add_child(this.coordsPanel);

        this.setContent(this.container);
    },

    _updateImageDimensions: function () {
        this._imageWidth = null;
        this._imageHeight = null;
        try {
            const auroraPath = this._deskletPath + "aurora_cache.jpg";
            const fallbackPath = this._deskletPath + "worldmap.png";
            const path = GLib.file_test(auroraPath, GLib.FileTest.EXISTS) ? auroraPath : fallbackPath;
            if (!GLib.file_test(path, GLib.FileTest.EXISTS)) return;
            const pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
            if (pixbuf) {
                this._imageWidth = pixbuf.get_width();
                this._imageHeight = pixbuf.get_height();
            }
        } catch (e) {
            /* ignore */
        }
    },

    _getMapStyle: function (widthPx, heightPx) {
        const auroraPath = this._deskletPath + "aurora_cache.jpg";
        const fallbackPath = this._deskletPath + "worldmap.png";
        let path = auroraPath;
        try {
            if (!GLib.file_test(auroraPath, GLib.FileTest.EXISTS)) {
                path = fallbackPath;
            }
        } catch (e) {
            path = fallbackPath;
        }
        let uri;
        try {
            uri = GLib.filename_to_uri(path, null);
        } catch (e) {
            uri = "file://" + encodeURI(path);
        }
        const cacheBust = this._imageCacheTime ? "?t=" + this._imageCacheTime : "";
        const size = (widthPx && heightPx) ? (widthPx + "px " + heightPx + "px") : "contain";
        return "background-image: url('" + uri + cacheBust + "'); background-size: " + size + "; background-repeat: no-repeat; background-position: center center;";
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
        if (this.mapBin) {
            this._updateImageDimensions();
            const mapHeight = (this._imageWidth && this._imageHeight && this._imageWidth > 0)
                ? Math.ceil(w * this._imageHeight / this._imageWidth)
                : Math.ceil(w);
            this.mapBin.set_style(this._getMapStyle(w, mapHeight) + " min-height: " + mapHeight + "px; height: " + mapHeight + "px;");
            this.mapBin.set_clip_to_allocation(true);
        }
    },

    _refreshCoords: function () {
        if (!this.coordsPanel) return;
        while (this.coordsPanel.get_n_children() > 0) {
            this.coordsPanel.remove_child(this.coordsPanel.get_child_at_index(0));
        }

        const kp = this._kpData;
        const color = this.theme === "light" ? "#1a1a1a" : "#e5e5e5";
        const style = "color: " + color + "; font-size: 11px;";

        if (!kp) {
            const noData = new St.Label({ text: _("No data"), style: style });
            this.coordsPanel.add_child(noData);
            return;
        }

        const addRow = function (label, value) {
            const row = new St.BoxLayout({ vertical: false, style_class: "aurora-coord-row" });
            const lbl = new St.Label({ text: label + ": ", style: style + " font-weight: 600;" });
            const val = new St.Label({ text: value, style: style });
            val.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            row.add_child(lbl);
            row.add_child(val);
            this.coordsPanel.add_child(row);
        }.bind(this);

        if (kp && this.showKp) {
            addRow(_("Kp"), formatKp(kp.kp_index));
            addRow(_("Estimated Kp"), formatKp(kp.estimated_kp));
        }
    },

    _fetchAuroraImage: function (retryAttempt) {
        retryAttempt = retryAttempt || 0;
        if (this._fetchInProgress) return;

        this._fetchInProgress = true;
        const file = Gio.File.new_for_uri(AURORA_IMAGE_URL);

        file.load_contents_async(null, Lang.bind(this, function (f, res) {
            try {
                const [ok, contents] = f.load_contents_finish(res);
                if (!ok) {
                    this._fetchInProgress = false;
                    if (retryAttempt < 2) {
                        Mainloop.timeout_add_seconds(RETRY_DELAY_SEC, Lang.bind(this, function () {
                            this._fetchAuroraImage(retryAttempt + 1);
                            return false;
                        }));
                    } else {
                        this._fetchKp();
                        return;
                    }
                    return;
                }
                const destPath = this._deskletPath + "aurora_cache.jpg";
                const destFile = Gio.File.new_for_path(destPath);
                const bytes = GLib.Bytes.new(contents);
                destFile.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.NONE, null, Lang.bind(this, function (gf, res) {
                    try {
                        destFile.replace_contents_finish(res);
                        this._imageCacheTime = Date.now();
                        this._updateImageDimensions();
                        this._applyWidth();
                        if (this.coordsPanel) this._refreshCoords();
                    } catch (e) {
                        global.logError("AuroraTracker save image: " + e.message);
                    }
                    this._fetchKp();
                }));
            } catch (e) {
                global.logError("AuroraTracker fetch aurora image: " + e.message);
                this._fetchInProgress = false;
                if (retryAttempt < 2) {
                    Mainloop.timeout_add_seconds(RETRY_DELAY_SEC, Lang.bind(this, function () {
                        this._fetchAuroraImage(retryAttempt + 1);
                        return false;
                    }));
                } else {
                    this._fetchKp();
                }
            }
        }));
    },

    _fetchKp: function () {
        const file = Gio.File.new_for_uri(KP_API_URL);
        file.load_contents_async(null, Lang.bind(this, function (f, res) {
            this._fetchInProgress = false;
            try {
                const [ok, contents] = f.load_contents_finish(res);
                if (!ok) {
                    this._kpData = null;
                } else {
                    let dataStr;
                    if (typeof imports.byteArray !== "undefined") {
                        dataStr = imports.byteArray.toString(contents);
                    } else {
                        dataStr = contents.toString();
                    }
                    const parsed = parseKpData(dataStr);
                    this._kpData = parsed;
                }
                if (this.coordsPanel) this._refreshCoords();
            } catch (e) {
                global.logError("AuroraTracker fetch Kp: " + e.message);
                this._kpData = null;
                if (this.coordsPanel) this._refreshCoords();
            }
            this._fetchInProgress = false;
            this._scheduleNextFetch();
        }));
    },

    _scheduleNextFetch: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
        const intervalMin = Math.max(5, parseInt(this.updateInterval, 10) || 5);
        const intervalSec = intervalMin * 60;
        this._timeout = Mainloop.timeout_add_seconds(intervalSec, Lang.bind(this, function () {
            this._fetchAuroraImage();
            return false;
        }));
    },

    on_settings_changed: function () {
        this.theme = this.settings.getValue("theme") || "dark";
        this.updateInterval = Math.max(5, parseInt(this.settings.getValue("updateInterval"), 10) || 5);
        this.showKp = this.settings.getValue("showKp") !== false;

        this._applyWidth();
        this._applyTitleStyle();

        const coordsClass = this.theme === "light" ? "aurora-coords-panel-light" : "aurora-coords-panel-dark";
        this.coordsPanel.remove_style_class_name("aurora-coords-panel-light");
        this.coordsPanel.remove_style_class_name("aurora-coords-panel-dark");
        this.coordsPanel.add_style_class_name(coordsClass);

        this._refreshCoords();
        this._scheduleNextFetch();
    },

    on_desklet_added_to_desktop: function () {
        this._scheduleNextFetch();
    },

    on_desklet_removed: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
        this._kpData = null;
        this._fetchInProgress = false;
    }
};

function main(metadata, deskletId) {
    return new AuroraTrackerDesklet(metadata, deskletId);
}
