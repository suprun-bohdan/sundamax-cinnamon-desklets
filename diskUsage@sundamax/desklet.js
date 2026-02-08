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

const UUID = "diskUsage@sundamax";

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

function formatBytes(bytes) {
    if (bytes < 0 || !isFinite(bytes)) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    if (bytes < 1024 * 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
    return (bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1) + " TB";
}

const FSTYPE_VIRTUAL = ["tmpfs", "devtmpfs", "devpts", "proc", "sysfs", "squashfs", "overlay", "cgroup", "cgroup2", "bpf", "hugetlbfs", "mqueue", "debugfs", "tracefs", "securityfs", "efivarfs", "fusectl", "configfs", "autofs", "pstore"];

function parseMountsAndQuery(text, excludeVirtual) {
    const result = [];
    const lines = text.trim().split("\n");

    for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(/\s+/);
        if (parts.length < 3) continue;

        let mount = parts[1].replace(/\\040/g, " ").replace(/\\011/g, "\t");
        const fstype = parts[2];

        if (excludeVirtual && FSTYPE_VIRTUAL.indexOf(fstype) >= 0) continue;

        try {
            const file = Gio.File.new_for_path(mount);
            const info = file.query_filesystem_info("filesystem::size,filesystem::free", null);

            if (!info) continue;

            const total = info.get_attribute_uint64("filesystem::size") || 0;
            const free = info.get_attribute_uint64("filesystem::free") || 0;

            if (total <= 0) continue;

            const used = total - free;
            const percent = Math.round((used / total) * 100);

            result.push({ mount, total, used, free, percent });
        } catch (mountErr) {
        }
    }
    return result;
}

function readDiskUsageAsync(excludeVirtual, callback) {
    const mountsFile = Gio.File.new_for_path("/proc/mounts");
    mountsFile.load_contents_async(null, function (file, res) {
        let result = [];
        try {
            const [ok, contents] = file.load_contents_finish(res);
            if (!ok || !contents) {
                callback(result);
                return;
            }
            let text;
            if (typeof imports.byteArray !== "undefined") {
                text = imports.byteArray.toString(contents);
            } else {
                text = contents.toString();
            }
            result = parseMountsAndQuery(text, excludeVirtual);
        } catch (e) {
            global.logError("DiskUsageDesklet readDiskUsage: " + e.message);
        }
        callback(result);
    });
}

function getProgressColor(percent) {
    if (percent < 70) return "#4caf50";
    if (percent < 90) return "#ff9800";
    return "#f44336";
}

function buildDiskCard(disk, theme, widthPx) {
    const cardClass = theme === "light" ? "disk-card-light" : "disk-card-dark";
    const progressClass = theme === "light" ? "disk-progress-light" : "disk-progress-dark";
    const progressBarWidth = Math.max(80, widthPx - 28);

    const card = new St.BoxLayout({ vertical: true, style_class: "disk-card " + cardClass, x_expand: true });

    const label = new St.Label({
        text: disk.mount,
        style_class: "disk-card-label",
        style: "max-width: " + progressBarWidth + "px;"
    });
    label.clutter_text.set_ellipsize(Pango.EllipsizeMode.MIDDLE);

    const valueText = `${formatBytes(disk.used)} / ${formatBytes(disk.total)} (${disk.percent}%)`;
    const value = new St.Label({
        text: valueText,
        style_class: "disk-card-value"
    });

    card.add_child(label);
    card.add_child(value);

    const progressContainer = new St.BoxLayout({ vertical: false, style_class: "disk-progress-container " + progressClass });
    const progressBg = new St.BoxLayout({ vertical: false, style_class: "disk-progress" });
    progressBg.set_style(`min-width: ${progressBarWidth}px; height: 6px; border-radius: 3px;`);

    const fillWidth = Math.max(4, Math.round((progressBarWidth * disk.percent) / 100));
    const progressBar = new St.BoxLayout({
        vertical: false,
        style_class: "disk-progress-bar"
    });
    progressBar.set_style(`min-width: ${fillWidth}px; width: ${fillWidth}px; height: 6px; border-radius: 3px; background-color: ${getProgressColor(disk.percent)};`);

    progressBg.add_child(progressBar);
    progressContainer.add_child(progressBg);
    card.add_child(progressContainer);

    return card;
}

function DiskUsageDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

DiskUsageDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.actor.set_style("background-color: transparent;");

        this.setHeader(_("Disk Usage"));
        this._header_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], deskletId);
        this.theme = this.settings.getValue("theme") || "dark";
        this.updateInterval = this.settings.getValue("updateInterval") || 5;
        this.widthPercent = parseInt(this.settings.getValue("widthPercent"), 10) || 10;
        this.excludeVirtual = this.settings.getValue("excludeVirtual") !== false;

        const boundSettings = ["theme", "updateInterval", "widthPercent", "excludeVirtual"];
        boundSettings.forEach(key => {
            this.settings.bindProperty(Settings.BindingDirection.IN, key, key, this.on_settings_changed, null);
        });

        this.container = new St.BoxLayout({ vertical: true, style_class: "disk-desklet-container", x_align: Clutter.ActorAlign.FILL });
        this.titleLabel = new St.Label({
            text: _("Disk Usage"),
            style_class: "disk-desklet-title",
            x_align: Clutter.ActorAlign.CENTER
        });
        this._applyTitleStyle();
        this.titleLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        this.container.add_child(this.titleLabel);

        this.diskContainer = new St.BoxLayout({ vertical: true, x_expand: true, x_align: Clutter.ActorAlign.FILL });
        this.container.add_child(this.diskContainer);

        this.setContent(this.container);
        this._applyWidth();

        this._timeout = null;
        this._cards = [];

        this.updateDisks();
    },

    updateDisks: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }

        readDiskUsageAsync(this.excludeVirtual, Lang.bind(this, function (disks) {
            Mainloop.idle_add(Lang.bind(this, function () {
                try {
                    while (this.diskContainer.get_n_children() > 0) {
                        this.diskContainer.remove_child(this.diskContainer.get_child_at_index(0));
                    }
                    this._cards = [];

                    if (disks.length === 0) {
                        const empty = new St.Label({
                            text: _("No disks found"),
                            style_class: "disk-card-label"
                        });
                        this.diskContainer.add_child(empty);
                    } else {
                        const widthPx = this._getWidthPx();
                        disks.forEach(function (disk) {
                            const card = buildDiskCard(disk, this.theme, widthPx);
                            card.set_opacity(0);
                            this.diskContainer.add_child(card);
                            this._cards.push(card);
                            card.ease({
                                duration: 150,
                                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                                opacity: 255
                            });
                        }, this);
                    }
                } catch (e) {
                    global.logError("DiskUsageDesklet: " + e.message);
                    const err = new St.Label({ text: _("Error"), style_class: "disk-card-label" });
                    while (this.diskContainer.get_n_children() > 0) {
                        this.diskContainer.remove_child(this.diskContainer.get_child_at_index(0));
                    }
                    this.diskContainer.add_child(err);
                }

                this._timeout = Mainloop.timeout_add_seconds(this.updateInterval, Lang.bind(this, function () {
                    this.updateDisks();
                    return true;
                }));
                return false;
            }));
        }));
    },

    _applyTitleStyle: function () {
        if (!this.titleLabel) return;
        const color = this.theme === "light" ? "#1a1a1a" : "#e5e5e5";
        this.titleLabel.set_style(`font-size: 13px; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 10px; color: ${color};`);
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
        if (this.diskContainer) {
            DeskletWrapper.applyContainerLayout(this.diskContainer, w);
        }
    },

    on_settings_changed: function () {
        this._applyWidth();
        if (this.titleLabel) {
            this.titleLabel.set_text(_("Disk Usage"));
            this._applyTitleStyle();
        }
        this.updateDisks();
    },

    on_desklet_removed: function () {
        if (this._timeout) Mainloop.source_remove(this._timeout);
        this._timeout = null;
        this._cards = [];
        if (this.diskContainer) {
            while (this.diskContainer.get_n_children() > 0) {
                this.diskContainer.remove_child(this.diskContainer.get_child_at_index(0));
            }
        }
    }
};

function main(metadata, deskletId) {
    return new DiskUsageDesklet(metadata, deskletId);
}
