const Desklet = imports.ui.desklet;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Pango = imports.gi.Pango;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;

imports.searchPath.unshift(GLib.get_home_dir() + "/.local/share/cinnamon/desklets");
const DeskletWrapper = imports.sundamaxCommon.deskletWrapper;

const Settings = imports.ui.settings;
const Gettext = imports.gettext;
const Lang = imports.lang;

const UUID = "worldClock@sundamax";

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

const TIMEZONE_TO_CITY = {
    "Europe/Kyiv": "Kyiv",
    "Europe/London": "London",
    "Europe/Paris": "Paris",
    "Europe/Berlin": "Berlin",
    "Europe/Rome": "Rome",
    "Europe/Madrid": "Madrid",
    "Europe/Amsterdam": "Amsterdam",
    "Europe/Warsaw": "Warsaw",
    "Europe/Moscow": "Moscow",
    "Europe/Istanbul": "Istanbul",
    "America/New_York": "New York",
    "America/Los_Angeles": "Los Angeles",
    "America/Chicago": "Chicago",
    "America/Toronto": "Toronto",
    "America/Mexico_City": "Mexico City",
    "Asia/Tokyo": "Tokyo",
    "Asia/Shanghai": "Beijing",
    "Asia/Dubai": "Dubai",
    "Asia/Singapore": "Singapore",
    "Australia/Sydney": "Sydney"
};

function getTimeForTimezone(tzId, showSeconds, timeFormat24) {
    try {
        const tz = GLib.TimeZone.new(tzId);
        const dt = GLib.DateTime.new_now(tz);
        let fmt;
        if (timeFormat24 !== false) {
            fmt = showSeconds ? "%H:%M:%S" : "%H:%M";
        } else {
            fmt = showSeconds ? "%I:%M:%S %p" : "%I:%M %p";
        }
        return {
            time: dt.format(fmt),
            date: dt.format("%d.%m.%Y")
        };
    } catch (e) {
        return { time: "--:--:--", date: "--.--.----" };
    }
}

function getCityName(tzId) {
    return TIMEZONE_TO_CITY[tzId] || tzId;
}

function buildClockCard(theme, data, showDate, widthPx) {
    const cardClass = theme === "light" ? "clock-card-light" : "clock-card-dark";

    const card = new St.BoxLayout({ vertical: true, style_class: "clock-card " + cardClass, x_expand: true });

    const cityLabel = new St.Label({
        text: data.city,
        style_class: "clock-city",
        x_align: Clutter.ActorAlign.CENTER
    });
    card.add_child(cityLabel);

    const timeLabel = new St.Label({
        text: data.time,
        style_class: "clock-time",
        x_align: Clutter.ActorAlign.CENTER
    });
    timeLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
    card.add_child(timeLabel);

    let dateLabel = null;
    if (showDate) {
        dateLabel = new St.Label({
            text: data.date,
            style_class: "clock-date",
            x_align: Clutter.ActorAlign.CENTER
        });
        card.add_child(dateLabel);
    }

    return { card, timeLabel, dateLabel };
}

function WorldClockDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

WorldClockDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.actor.set_style("background-color: transparent;");

        this.setHeader(_("World Clock"));
        this._header_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], deskletId);
        this.theme = this.settings.getValue("theme") || "dark";
        this.widthPercent = parseInt(this.settings.getValue("widthPercent"), 10) || 10;
        this.showSeconds = this.settings.getValue("showSeconds") !== false;
        this.showDate = this.settings.getValue("showDate") !== false;

        this.timeFormat24 = this.settings.getValue("timeFormat") !== "12h";
        const boundSettings = ["theme", "widthPercent", "timezone", "timeFormat", "showSeconds", "showDate"];
        boundSettings.forEach(key => {
            this.settings.bindProperty(Settings.BindingDirection.IN, key, key, this.on_settings_changed, null);
        });

        this.container = new St.BoxLayout({ vertical: true, style_class: "clock-desklet-container", x_align: Clutter.ActorAlign.FILL });

        this.clockLabels = null;

        this._buildClock();
        this.setContent(this.container);
        this._applyWidth();

        this._timeout = null;
        this.updateTime();
    },

    _getTimezone: function () {
        let tz = this.settings.getValue("timezone");
        if (tz) return tz;
        const clocks = this.settings.getValue("clocks");
        if (Array.isArray(clocks) && clocks.length > 0) {
            tz = clocks[0];
            this.settings.setValue("timezone", tz);
            return tz;
        }
        if (typeof clocks === "string") {
            try {
                const arr = JSON.parse(clocks);
                if (Array.isArray(arr) && arr.length > 0) {
                    tz = arr[0];
                    this.settings.setValue("timezone", tz);
                    return tz;
                }
            } catch (e) {}
        }
        return "Europe/Kyiv";
    },

    _buildClock: function () {
        while (this.container.get_n_children() > 0) {
            this.container.remove_child(this.container.get_child_at_index(0));
        }

        this.clockLabels = null;

        const tzId = this._getTimezone();
        const city = getCityName(tzId);
        this.timeFormat24 = this.settings.getValue("timeFormat") !== "12h";
        const data = getTimeForTimezone(tzId, this.showSeconds, this.timeFormat24);
        data.city = city;

        const widthPx = this._getWidthPx();
        const built = buildClockCard(this.theme, data, this.showDate, widthPx);
        this.clockLabels = { timeLabel: built.timeLabel, dateLabel: built.dateLabel };
        this._applyClockStyle(built);
        built.card.set_opacity(0);
        this.container.add_child(built.card);
        built.card.ease({
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            opacity: 255
        });
    },

    _applyClockStyle: function (built) {
        const color = this.theme === "light" ? "#1a1a1a" : "#e5e5e5";
        const style = `color: ${color};`;

        const cityChild = built.card.get_child_at_index(0);
        if (cityChild) cityChild.set_style(style);
        if (built.timeLabel) built.timeLabel.set_style(style);
        if (built.dateLabel) built.dateLabel.set_style(style);
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

    updateTime: function () {
        const tzId = this._getTimezone();
        this.timeFormat24 = this.settings.getValue("timeFormat") !== "12h";
        const data = getTimeForTimezone(tzId, this.showSeconds, this.timeFormat24);
        if (this.clockLabels) {
            if (this.clockLabels.timeLabel) this.clockLabels.timeLabel.set_text(data.time);
            if (this.clockLabels.dateLabel) this.clockLabels.dateLabel.set_text(data.date);
        }

        const intervalSec = this.showSeconds ? 1 : 60;
        if (this._timeout) Mainloop.source_remove(this._timeout);
        this._timeout = Mainloop.timeout_add_seconds(intervalSec, Lang.bind(this, function () {
            this.updateTime();
            return true;
        }));
    },

    on_settings_changed: function () {
        this._applyWidth();
        this._buildClock();
        this.updateTime();
    },

    on_desklet_removed: function () {
        if (this._timeout) Mainloop.source_remove(this._timeout);
        this._timeout = null;
        this.clockLabels = null;
    }
};

function main(metadata, deskletId) {
    return new WorldClockDesklet(metadata, deskletId);
}
