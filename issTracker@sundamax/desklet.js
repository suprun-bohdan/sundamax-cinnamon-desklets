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

const UUID = "issTracker@sundamax";
const ISS_API_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const RETRY_DELAY_SEC = 5;

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

function parseISSData(data) {
    try {
        const obj = JSON.parse(data);
        const lat = typeof obj.latitude === "number" ? obj.latitude : null;
        const lon = typeof obj.longitude === "number" ? obj.longitude : null;
        return {
            latitude: lat,
            longitude: lon,
            altitude: typeof obj.altitude === "number" ? obj.altitude : null,
            velocity: typeof obj.velocity === "number" ? obj.velocity : null,
            visibility: obj.visibility || "unknown"
        };
    } catch (e) {
        global.logError("ISSTracker parseISSData: " + e.message);
        return null;
    }
}

function formatCoord(val, ns) {
    if (val === null || !isFinite(val)) return "—";
    const abs = Math.abs(val).toFixed(2);
    const dir = val >= 0 ? ns : (ns === "N" ? "S" : "W");
    return abs + "° " + dir;
}

function formatAltitude(km) {
    if (km === null || !isFinite(km)) return "—";
    return "~" + Math.round(km) + " km";
}

function formatVelocity(kmh) {
    if (kmh === null || !isFinite(kmh)) return "—";
    return "~" + Math.round(kmh) + " km/h";
}

function formatVisibility(v) {
    if (!v) return "—";
    if (v === "daylight") return _("Daylight");
    if (v === "eclipsed") return _("Eclipsed");
    return v;
}

function latLonToPixel(lat, lon, mapWidth, mapHeight) {
    if (lat === null || lon === null || !isFinite(lat) || !isFinite(lon)) return null;
    let x = ((lon + 180) / 360) * mapWidth;
    let y = ((90 - lat) / 180) * mapHeight;
    y = Math.max(0, Math.min(mapHeight, y));
    return { x: Math.round(x), y: Math.round(y) };
}

function ISSTrackerDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

ISSTrackerDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.actor.set_style("background-color: transparent;");

        this.setHeader(_("ISS Tracker"));
        this._header_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], deskletId);
        this.theme = this.settings.getValue("theme") || "dark";
        this.widthPercent = parseInt(this.settings.getValue("widthPercent"), 10) || 10;
        this.updateInterval = Math.max(1, parseInt(this.settings.getValue("updateInterval"), 10) || 1);
        this.showAltitude = this.settings.getValue("showAltitude") !== false;
        this.showVelocity = this.settings.getValue("showVelocity") !== false;
        this.showVisibility = this.settings.getValue("showVisibility") !== false;
        this.showTrajectory = this.settings.getValue("showTrajectory") !== false;
        this.trajectoryLength = parseInt(this.settings.getValue("trajectoryLength"), 10) || 60;

        const boundSettings = ["theme", "widthPercent", "updateInterval", "showAltitude", "showVelocity", "showVisibility", "showTrajectory", "trajectoryLength"];
        boundSettings.forEach(function (key) {
            this.settings.bindProperty(Settings.BindingDirection.IN, key, key, this.on_settings_changed, null);
        }, this);

        this._deskletPath = GLib.get_home_dir() + "/.local/share/cinnamon/desklets/" + this.metadata["uuid"] + "/";
        this._issData = null;
        this._timeout = null;
        this._fetchInProgress = false;
        this._trajectoryBuffer = [];

        this._buildUI();
        this._applyWidth();
        this._fetchISS();
    },

    _buildUI: function () {
        this.container = new St.BoxLayout({ vertical: true, style_class: "iss-desklet-container", x_align: Clutter.ActorAlign.FILL });
        this.titleLabel = new St.Label({
            text: _("ISS Tracker"),
            style_class: "iss-desklet-title",
            x_align: Clutter.ActorAlign.CENTER
        });
        this._applyTitleStyle();
        this.titleLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        this.container.add_child(this.titleLabel);

        this.mapBin = new St.Bin({ x_expand: true, style_class: "iss-map-container" });

        this.overlayActor = new Clutter.Actor({ x_expand: true });
        this.overlayActor.set_reactive(false);

        this._buildTrajectoryCanvas();
        if (this.trajectoryCanvas) {
            this.trajectoryCanvas.set_position(0, 0);
            this.trajectoryCanvas.visible = this.showTrajectory;
            this.overlayActor.add_actor(this.trajectoryCanvas);
        }

        const issIconPath = this._deskletPath + "iss-icon.png";
        try {
            const gicon = Gio.icon_new_for_string(issIconPath);
            this.issIcon = new St.Icon({ gicon: gicon, icon_size: 24, icon_type: St.IconType.FULLCOLOR });
        } catch (e) {
            this.issIcon = new St.Label({ text: "●", style: "font-size: 18px; color: #2196F3;" });
        }
        this.issIcon.set_position(0, 0);
        this.overlayActor.add_actor(this.issIcon);

        this.mapBin.set_child(this.overlayActor);
        this.container.add_child(this.mapBin);

        const coordsClass = this.theme === "light" ? "iss-coords-panel-light" : "iss-coords-panel-dark";
        this.coordsPanel = new St.BoxLayout({ vertical: true, style_class: "iss-coords-panel " + coordsClass, x_expand: true, x_align: Clutter.ActorAlign.FILL });
        this.coordsPanel.set_clip_to_allocation(true);
        this.container.add_child(this.coordsPanel);

        this.setContent(this.container);
    },

    _buildTrajectoryCanvas: function () {
        this.trajectoryCanvas = null;
        try {
            if (typeof Clutter.Canvas === "undefined") throw new Error("Clutter.Canvas not available");
            const w = this._getWidthPx();
            const h = Math.floor(w / 2);
            const canvas = new Clutter.Canvas();
            canvas.set_size(w, h);
            canvas.connect("draw", Lang.bind(this, this._onTrajectoryDraw));
            const actor = new Clutter.Actor({ width: w, height: h, x_expand: true });
            actor.set_content(canvas);
            actor.set_reactive(false);
            this.trajectoryCanvas = actor;
        } catch (e) {
            global.logError("ISSTracker trajectory canvas: " + e.message);
        }
    },

    _onTrajectoryDraw: function (content, cr, width, height) {
        cr.save();
        cr.setOperator(3);
        cr.setSourceRGBA(0, 0, 0, 0);
        cr.paint();
        cr.restore();

        if (!this.showTrajectory || !this._trajectoryBuffer || this._trajectoryBuffer.length < 2) return;
        const buf = this._trajectoryBuffer;
        cr.save();
        const r = this.theme === "light" ? 0.13 : 0.13;
        const g = this.theme === "light" ? 0.23 : 0.59;
        const b = this.theme === "light" ? 0.36 : 0.95;
        cr.setSourceRGBA(r, g, b, 0.6);
        cr.setLineWidth(2);
        cr.setLineCap(1);
        let started = false;
        for (let i = 0; i < buf.length - 1; i++) {
            const p1 = latLonToPixel(buf[i].lat, buf[i].lon, width, height);
            const p2 = latLonToPixel(buf[i + 1].lat, buf[i + 1].lon, width, height);
            if (!p1 || !p2) { started = false; continue; }
            if (Math.abs(buf[i + 1].lon - buf[i].lon) > 180) { started = false; continue; }
            if (!started) {
                cr.moveTo(p1.x, p1.y);
                started = true;
            }
            cr.lineTo(p2.x, p2.y);
        }
        if (started) cr.stroke();
        cr.restore();
    },

    _updateTrajectory: function () {
        if (!this.trajectoryCanvas) return;
        const content = this.trajectoryCanvas.get_content();
        if (content && typeof content.invalidate === "function") {
            content.invalidate();
        }
    },

    _getMapStyle: function () {
        const mapPath = this._deskletPath + "worldmap.png";
        let uri;
        try {
            uri = GLib.filename_to_uri(mapPath, null);
        } catch (e) {
            uri = "file://" + encodeURI(mapPath);
        }
        return "background-image: url('" + uri + "'); background-size: contain; background-repeat: no-repeat; background-position: center;";
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
            const mapHeight = Math.floor(w / 2);
            this.mapBin.set_style(this._getMapStyle() + " min-height: " + mapHeight + "px; height: " + mapHeight + "px;");
            this.mapBin.set_clip_to_allocation(true);
            if (this.overlayActor) {
                this.overlayActor.set_size(w, mapHeight);
                if (this.trajectoryCanvas) {
                    this.trajectoryCanvas.set_size(w, mapHeight);
                    const content = this.trajectoryCanvas.get_content();
                    if (content && content.set_size) {
                        content.set_size(w, mapHeight);
                    }
                    this._updateTrajectory();
                }
                this._updateISSPosition();
            }
        }
    },

    _updateISSPosition: function () {
        if (!this._issData || !this.overlayActor) return;
        const w = this.overlayActor.width;
        const h = this.overlayActor.height;
        const pos = latLonToPixel(this._issData.latitude, this._issData.longitude, w, h);
        if (pos) {
            const iconW = 24;
            const iconH = 24;
            this.issIcon.set_position(Math.max(0, pos.x - iconW / 2), Math.max(0, pos.y - iconH / 2));
        }
    },

    _refreshCoords: function () {
        while (this.coordsPanel.get_n_children() > 0) {
            this.coordsPanel.remove_child(this.coordsPanel.get_child_at_index(0));
        }

        const d = this._issData;
        const color = this.theme === "light" ? "#1a1a1a" : "#e5e5e5";
        const style = "color: " + color + "; font-size: 11px;";

        if (!d) {
            const noData = new St.Label({ text: _("No data"), style: style });
            this.coordsPanel.add_child(noData);
            return;
        }

        const addRow = function (label, value) {
            const row = new St.BoxLayout({ vertical: false, style_class: "iss-coord-row" });
            const lbl = new St.Label({ text: label + ": ", style: style + " font-weight: 600;" });
            const val = new St.Label({ text: value, style: style });
            val.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            row.add_child(lbl);
            row.add_child(val);
            this.coordsPanel.add_child(row);
        }.bind(this);

        addRow(_("Lat"), formatCoord(d.latitude, "N"));
        addRow(_("Lon"), formatCoord(d.longitude, "E"));
        if (this.showAltitude) addRow(_("Altitude"), formatAltitude(d.altitude));
        if (this.showVelocity) addRow(_("Velocity"), formatVelocity(d.velocity));
        if (this.showVisibility) addRow(_("Visibility"), formatVisibility(d.visibility));
    },

    _fetchISS: function (retryAttempt) {
        retryAttempt = retryAttempt || 0;
        if (this._fetchInProgress) return;

        this._fetchInProgress = true;
        const file = Gio.File.new_for_uri(ISS_API_URL);

        file.load_contents_async(null, Lang.bind(this, function (f, res) {
            this._fetchInProgress = false;
            try {
                const [ok, contents] = f.load_contents_finish(res);
                if (!ok) {
                    if (retryAttempt < 2) {
                        Mainloop.timeout_add_seconds(RETRY_DELAY_SEC, Lang.bind(this, function () {
                            this._fetchISS(retryAttempt + 1);
                            return false;
                        }));
                    } else {
                        this._issData = null;
                        this._refreshCoords();
                        this._scheduleNextFetch();
                    }
                    return;
                }
                let dataStr;
                if (typeof imports.byteArray !== "undefined") {
                    dataStr = imports.byteArray.toString(contents);
                } else {
                    dataStr = contents.toString();
                }
                const parsed = parseISSData(dataStr);
                if (parsed) {
                    this._issData = parsed;
                    if (parsed.latitude !== null && parsed.longitude !== null) {
                        this._trajectoryBuffer.push({ lat: parsed.latitude, lon: parsed.longitude });
                        const maxLen = Math.max(2, parseInt(this.trajectoryLength, 10) || 60);
                        while (this._trajectoryBuffer.length > maxLen) {
                            this._trajectoryBuffer.shift();
                        }
                        this._updateTrajectory();
                    }
                    this._updateISSPosition();
                    this._refreshCoords();
                }
                this._scheduleNextFetch();
            } catch (e) {
                global.logError("ISSTracker fetch: " + e.message);
                this._fetchInProgress = false;
                if (retryAttempt < 2) {
                    Mainloop.timeout_add_seconds(RETRY_DELAY_SEC, Lang.bind(this, function () {
                        this._fetchISS(retryAttempt + 1);
                        return false;
                    }));
                } else {
                    this._issData = null;
                    this._refreshCoords();
                    this._scheduleNextFetch();
                }
            }
        }));
    },

    _scheduleNextFetch: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
        const interval = Math.max(1, parseInt(this.updateInterval, 10) || 1);
        this._timeout = Mainloop.timeout_add_seconds(interval, Lang.bind(this, function () {
            this._fetchISS();
            return false;
        }));
    },

    on_settings_changed: function () {
        this.theme = this.settings.getValue("theme") || "dark";
        this.updateInterval = Math.max(1, parseInt(this.settings.getValue("updateInterval"), 10) || 1);
        this.showAltitude = this.settings.getValue("showAltitude") !== false;
        this.showVelocity = this.settings.getValue("showVelocity") !== false;
        this.showVisibility = this.settings.getValue("showVisibility") !== false;
        this.showTrajectory = this.settings.getValue("showTrajectory") !== false;
        this.trajectoryLength = Math.max(2, parseInt(this.settings.getValue("trajectoryLength"), 10) || 60);

        while (this._trajectoryBuffer.length > this.trajectoryLength) {
            this._trajectoryBuffer.shift();
        }

        this._applyWidth();
        this._applyTitleStyle();

        if (this.trajectoryCanvas) {
            this.trajectoryCanvas.visible = this.showTrajectory;
            this._updateTrajectory();
        }

        const coordsClass = this.theme === "light" ? "iss-coords-panel-light" : "iss-coords-panel-dark";
        this.coordsPanel.remove_style_class_name("iss-coords-panel-light");
        this.coordsPanel.remove_style_class_name("iss-coords-panel-dark");
        this.coordsPanel.add_style_class_name(coordsClass);

        this._refreshCoords();
        this._scheduleNextFetch();
    },

    on_desklet_removed: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
        this._issData = null;
        this._trajectoryBuffer = [];
    }
};

function main(metadata, deskletId) {
    return new ISSTrackerDesklet(metadata, deskletId);
}
