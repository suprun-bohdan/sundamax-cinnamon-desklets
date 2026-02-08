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

const UUID = "earthquakeTracker@sundamax";
const QUAKE_API_URL = "https://api.vedur.is/skjalftalisa/v1/quakefilter";
const EMSC_API_BASE = "https://www.seismicportal.eu/fdsnws/event/1/query";
const RETRY_DELAY_SEC = 5;
const ICELAND_LAT_MIN = 63.1;
const ICELAND_LAT_MAX = 66.8;
const ICELAND_LON_MIN = -25;
const ICELAND_LON_MAX = -13;
const ICELAND_AREA = [[67.5, -25.0], [67.5, -12.0], [62.5, -12.0], [62.5, -25.0]];

// Demo data: hardcoded events (size_min 0, Jan 31 – Feb 7, 2026)
const DEMO_QUAKE_EVENTS = [
    { event_id: 1429275, lat: 63.948, lon: -21.98, magnitude: 0.2, depth: 4, time: "2026-01-31T00:29:47" },
    { event_id: 1429287, lat: 63.907, lon: -21.977, magnitude: 0.6, depth: 6, time: "2026-01-31T00:49:39" },
    { event_id: 1429277, lat: 63.644, lon: -19.148, magnitude: 0.8, depth: 8, time: "2026-01-31T02:03:46" },
    { event_id: 1429278, lat: 65.106, lon: -16.365, magnitude: 1.0, depth: 7, time: "2026-01-31T02:10:00" },
    { event_id: 1429279, lat: 63.913, lon: -22.029, magnitude: 0.4, depth: 5, time: "2026-01-31T02:54:20" },
    { event_id: 1429283, lat: 64.685, lon: -17.451, magnitude: 0.2, depth: 5, time: "2026-01-31T03:12:39" },
    { event_id: 1429285, lat: 64.631, lon: -17.395, magnitude: 0.8, depth: 2, time: "2026-01-31T05:04:01" },
    { event_id: 1429286, lat: 63.916, lon: -22.051, magnitude: 0.9, depth: 5, time: "2026-01-31T05:19:24" },
    { event_id: 1429291, lat: 63.937, lon: -22.079, magnitude: 0.7, depth: 4, time: "2026-01-31T05:39:04" },
    { event_id: 1429289, lat: 64.001, lon: -21.462, magnitude: 0.8, depth: 1, time: "2026-01-31T05:40:25" },
    { event_id: 1429290, lat: 64.022, lon: -21.156, magnitude: 1.1, depth: 6, time: "2026-01-31T05:47:28" },
    { event_id: 1429295, lat: 64.616, lon: -17.416, magnitude: 0.2, depth: 8, time: "2026-01-31T06:50:41" },
    { event_id: 1429294, lat: 64.621, lon: -17.449, magnitude: 0.7, depth: 6, time: "2026-01-31T07:05:55" },
    { event_id: 1429296, lat: 64.629, lon: -17.427, magnitude: 0.8, depth: 6, time: "2026-01-31T07:35:33" },
    { event_id: 1429298, lat: 64.02, lon: -21.491, magnitude: 0.2, depth: 3, time: "2026-01-31T07:46:16" },
    { event_id: 1429299, lat: 64.018, lon: -21.521, magnitude: 0.6, depth: 7, time: "2026-01-31T07:51:25" },
    { event_id: 1429301, lat: 64.012, lon: -21.506, magnitude: 0.7, depth: 5, time: "2026-01-31T07:56:02" },
    { event_id: 1429302, lat: 64.661, lon: -17.468, magnitude: 0.6, depth: 4, time: "2026-01-31T08:10:23" },
    { event_id: 1429304, lat: 63.924, lon: -21.874, magnitude: 1.1, depth: 9, time: "2026-01-31T10:16:40" },
    { event_id: 1429305, lat: 64.01, lon: -21.162, magnitude: 0.6, depth: 8, time: "2026-01-31T10:23:03" },
    { event_id: 1429309, lat: 64.669, lon: -17.449, magnitude: 5.3, depth: 2, time: "2026-01-31T11:54:48" },
    { event_id: 1429317, lat: 64.676, lon: -17.495, magnitude: 1.1, depth: 7, time: "2026-01-31T11:58:34" },
    { event_id: 1429313, lat: 64.646, lon: -17.381, magnitude: 0.6, depth: 0, time: "2026-01-31T12:04:45" },
    { event_id: 1429314, lat: 63.945, lon: -19.227, magnitude: 0.6, depth: 0, time: "2026-01-31T12:11:44" },
    { event_id: 1429315, lat: 63.929, lon: -19.247, magnitude: 1.0, depth: 0, time: "2026-01-31T12:13:08" },
    { event_id: 1429316, lat: 64.643, lon: -17.403, magnitude: 0.1, depth: 0, time: "2026-01-31T12:16:37" },
    { event_id: 1429318, lat: 64.675, lon: -17.471, magnitude: 1.8, depth: 3, time: "2026-01-31T12:23:29" },
    { event_id: 1429325, lat: 64.675, lon: -17.458, magnitude: 2.5, depth: 4, time: "2026-01-31T12:25:59" },
    { event_id: 1429324, lat: 64.644, lon: -17.4, magnitude: 2.2, depth: 6, time: "2026-01-31T12:27:09" },
    { event_id: 1429326, lat: 63.935, lon: -19.231, magnitude: 0.6, depth: 0, time: "2026-01-31T12:31:46" },
    { event_id: 1429327, lat: 63.928, lon: -19.241, magnitude: 0.2, depth: 0, time: "2026-01-31T12:32:38" },
    { event_id: 1429328, lat: 64.621, lon: -17.36, magnitude: 0.6, depth: 0, time: "2026-01-31T12:36:55" },
    { event_id: 1429329, lat: 64.604, lon: -17.347, magnitude: 0.2, depth: 0, time: "2026-01-31T12:47:30" },
    { event_id: 1429330, lat: 64.645, lon: -17.386, magnitude: 0.6, depth: 1, time: "2026-01-31T12:52:39" },
    { event_id: 1429332, lat: 64.642, lon: -17.411, magnitude: 0.9, depth: 3, time: "2026-01-31T13:10:43" },
    { event_id: 1429333, lat: 64.012, lon: -21.504, magnitude: 0.8, depth: 6, time: "2026-01-31T13:12:21" },
    { event_id: 1429335, lat: 64.628, lon: -17.423, magnitude: 0.8, depth: 4, time: "2026-01-31T13:33:54" },
    { event_id: 1429336, lat: 63.627, lon: -19.212, magnitude: 1.1, depth: 3, time: "2026-01-31T13:38:15" },
    { event_id: 1429337, lat: 63.981, lon: -21.949, magnitude: 1.2, depth: 3, time: "2026-01-31T14:00:12" },
    { event_id: 1429338, lat: 64.645, lon: -17.402, magnitude: 0.9, depth: 2, time: "2026-01-31T14:06:56" },
    { event_id: 1429339, lat: 64.01, lon: -21.515, magnitude: 0.4, depth: 6, time: "2026-01-31T14:28:23" },
    { event_id: 1429343, lat: 64.683, lon: -17.453, magnitude: 0.2, depth: 1, time: "2026-01-31T16:06:24" },
    { event_id: 1429346, lat: 63.632, lon: -19.271, magnitude: 1.0, depth: 8, time: "2026-01-31T16:14:40" },
    { event_id: 1429347, lat: 63.626, lon: -19.219, magnitude: 0.7, depth: 2, time: "2026-01-31T16:15:03" },
    { event_id: 1429354, lat: 63.688, lon: -19.121, magnitude: 1.0, depth: 5, time: "2026-01-31T17:07:06" },
    { event_id: 1429348, lat: 64.672, lon: -17.475, magnitude: 0.0, depth: 3, time: "2026-01-31T17:30:49" },
    { event_id: 1429349, lat: 64.646, lon: -17.379, magnitude: 0.2, depth: 0, time: "2026-01-31T17:34:08" },
    { event_id: 1429350, lat: 63.949, lon: -22.065, magnitude: 0.9, depth: 5, time: "2026-01-31T18:15:41" },
    { event_id: 1429351, lat: 63.966, lon: -19.256, magnitude: 0.6, depth: 4, time: "2026-01-31T18:34:41" },
    { event_id: 1429352, lat: 66.188, lon: -17.787, magnitude: 0.5, depth: 10, time: "2026-01-31T18:43:02" },
    { event_id: 1429353, lat: 63.685, lon: -19.078, magnitude: 0.7, depth: 12, time: "2026-01-31T19:11:46" },
    { event_id: 1429355, lat: 64.604, lon: -17.402, magnitude: 0.3, depth: 0, time: "2026-01-31T19:52:45" },
    { event_id: 1429357, lat: 64.5, lon: -17.695, magnitude: 3.0, depth: 11, time: "2026-01-31T19:54:08" },
    { event_id: 1429358, lat: 64.511, lon: -17.744, magnitude: 1.3, depth: 11, time: "2026-01-31T20:28:18" },
    { event_id: 1429359, lat: 66.235, lon: -16.857, magnitude: 1.2, depth: 7, time: "2026-01-31T20:50:29" },
    { event_id: 1429360, lat: 63.948, lon: -19.287, magnitude: 0.9, depth: 4, time: "2026-01-31T21:18:52" },
    { event_id: 1429361, lat: 64.812, lon: -21.852, magnitude: 0.6, depth: 21, time: "2026-01-31T21:23:06" },
    { event_id: 1429363, lat: 63.904, lon: -21.96, magnitude: 0.5, depth: 6, time: "2026-01-31T22:20:31" },
    { event_id: 1429364, lat: 63.947, lon: -21.965, magnitude: 0.4, depth: 5, time: "2026-01-31T23:14:09" },
    { event_id: 1429365, lat: 64.646, lon: -17.399, magnitude: 0.7, depth: 0, time: "2026-02-01T00:02:45" },
    { event_id: 1429366, lat: 64.684, lon: -16.63, magnitude: 0.3, depth: 11, time: "2026-02-01T01:05:48" },
    { event_id: 1429369, lat: 64.5, lon: -17.689, magnitude: 1.2, depth: 1, time: "2026-02-01T01:25:02" },
    { event_id: 1429370, lat: 64.642, lon: -17.492, magnitude: 0.6, depth: 5, time: "2026-02-01T01:26:19" },
    { event_id: 1429371, lat: 63.945, lon: -21.761, magnitude: 0.6, depth: 6, time: "2026-02-01T02:10:15" },
    { event_id: 1429379, lat: 63.914, lon: -22.001, magnitude: 0.4, depth: 5, time: "2026-02-01T02:14:39" },
    { event_id: 1429373, lat: 65.025, lon: -16.673, magnitude: 1.3, depth: 4, time: "2026-02-01T02:23:57" },
    { event_id: 1429390, lat: 63.935, lon: -21.854, magnitude: 0.8, depth: 5, time: "2026-02-01T02:29:10" },
    { event_id: 1429374, lat: 64.809, lon: -21.954, magnitude: 0.6, depth: 10, time: "2026-02-01T03:12:47" },
    { event_id: 1429375, lat: 64.484, lon: -17.732, magnitude: 1.1, depth: 13, time: "2026-02-01T03:31:41" },
    { event_id: 1429376, lat: 63.885, lon: -22.19, magnitude: 0.6, depth: 12, time: "2026-02-01T04:33:35" },
    { event_id: 1429377, lat: 65.442, lon: -16.663, magnitude: 1.3, depth: 6, time: "2026-02-01T04:41:59" },
    { event_id: 1429378, lat: 63.909, lon: -22.028, magnitude: 0.7, depth: 2, time: "2026-02-01T05:04:20" },
    { event_id: 1429380, lat: 63.951, lon: -21.309, magnitude: 0.4, depth: 5, time: "2026-02-01T05:53:40" },
    { event_id: 1429395, lat: 66.407, lon: -17.971, magnitude: 0.4, depth: 15, time: "2026-02-01T06:05:01" },
    { event_id: 1429382, lat: 63.981, lon: -21.565, magnitude: 0.6, depth: 10, time: "2026-02-01T08:15:08" },
    { event_id: 1429383, lat: 64.482, lon: -17.768, magnitude: 0.7, depth: 2, time: "2026-02-01T08:58:51" },
    { event_id: 1429384, lat: 65.176, lon: -16.323, magnitude: 0.5, depth: 6, time: "2026-02-01T09:05:01" },
    { event_id: 1429385, lat: 65.173, lon: -16.328, magnitude: 0.4, depth: 6, time: "2026-02-01T09:12:22" },
    { event_id: 1429386, lat: 65.178, lon: -16.338, magnitude: 1.1, depth: 5, time: "2026-02-01T09:13:44" },
    { event_id: 1429387, lat: 63.94, lon: -22.077, magnitude: 0.4, depth: 4, time: "2026-02-01T09:18:43" },
    { event_id: 1429388, lat: 63.946, lon: -21.702, magnitude: 0.6, depth: 3, time: "2026-02-01T09:29:50" },
    { event_id: 1429389, lat: 63.919, lon: -21.904, magnitude: 0.7, depth: 7, time: "2026-02-01T09:33:15" },
    { event_id: 1429391, lat: 63.805, lon: -22.703, magnitude: 0.6, depth: 3, time: "2026-02-01T09:39:34" },
    { event_id: 1429392, lat: 65.18, lon: -16.346, magnitude: 0.5, depth: 9, time: "2026-02-01T09:42:08" },
    { event_id: 1429393, lat: 63.888, lon: -22.211, magnitude: 0.5, depth: 8, time: "2026-02-01T12:05:53" },
    { event_id: 1429394, lat: 63.677, lon: -19.205, magnitude: 1.0, depth: 8, time: "2026-02-01T12:15:04" },
    { event_id: 1429396, lat: 66.437, lon: -17.687, magnitude: 1.0, depth: 14, time: "2026-02-01T12:30:28" },
    { event_id: 1429397, lat: 63.785, lon: -22.633, magnitude: 0.4, depth: 1, time: "2026-02-01T13:11:16" },
    { event_id: 1429399, lat: 65.038, lon: -16.654, magnitude: 0.7, depth: 5, time: "2026-02-01T14:10:15" },
    { event_id: 1429402, lat: 64.629, lon: -17.401, magnitude: 0.8, depth: 0, time: "2026-02-01T14:43:05" },
    { event_id: 1429403, lat: 64.502, lon: -17.706, magnitude: 0.8, depth: 2, time: "2026-02-01T15:08:55" },
    { event_id: 1429404, lat: 66.148, lon: -16.863, magnitude: 0.9, depth: 10, time: "2026-02-01T15:13:52" },
    { event_id: 1429405, lat: 63.924, lon: -21.245, magnitude: 0.6, depth: 8, time: "2026-02-01T15:14:24" },
    { event_id: 1429408, lat: 64.626, lon: -17.628, magnitude: 0.9, depth: 5, time: "2026-02-01T20:23:07" },
    { event_id: 1429409, lat: 64.81, lon: -21.929, magnitude: 0.4, depth: 17, time: "2026-02-01T20:26:10" },
    { event_id: 1429410, lat: 63.614, lon: -19.062, magnitude: 1.1, depth: 3, time: "2026-02-01T20:58:08" },
    { event_id: 1429411, lat: 64.116, lon: -21.237, magnitude: 0.9, depth: 6, time: "2026-02-01T21:09:35" },
    { event_id: 1429413, lat: 63.964, lon: -19.31, magnitude: 1.9, depth: 1, time: "2026-02-01T22:24:53" },
    { event_id: 1429414, lat: 63.606, lon: -19.059, magnitude: 1.1, depth: 5, time: "2026-02-02T00:17:09" },
    { event_id: 1429415, lat: 65.242, lon: -16.403, magnitude: 0.7, depth: 5, time: "2026-02-02T01:22:19" },
    { event_id: 1429416, lat: 65.147, lon: -16.504, magnitude: 0.8, depth: 7, time: "2026-02-02T01:50:21" },
    { event_id: 1429417, lat: 64.008, lon: -21.501, magnitude: 0.8, depth: 8, time: "2026-02-02T02:25:03" },
    { event_id: 1429418, lat: 64.254, lon: -17.064, magnitude: 1.5, depth: 4, time: "2026-02-02T02:39:58" },
    { event_id: 1429419, lat: 63.962, lon: -21.725, magnitude: 0.9, depth: 5, time: "2026-02-02T03:51:24" },
    { event_id: 1429433, lat: 64.793, lon: -22.063, magnitude: 0.2, depth: 19, time: "2026-02-02T03:52:31" },
    { event_id: 1429421, lat: 64.628, lon: -17.386, magnitude: 1.9, depth: 3, time: "2026-02-02T04:20:20" },
    { event_id: 1429422, lat: 65.133, lon: -16.387, magnitude: 0.3, depth: 7, time: "2026-02-02T06:38:21" },
    { event_id: 1429423, lat: 64.273, lon: -17.59, magnitude: 1.3, depth: 4, time: "2026-02-02T07:13:36" },
    { event_id: 1429431, lat: 64.806, lon: -22.032, magnitude: 0.2, depth: 20, time: "2026-02-02T07:25:18" },
    { event_id: 1429424, lat: 64.36, lon: -17.312, magnitude: 0.5, depth: 5, time: "2026-02-02T08:30:24" },
    { event_id: 1429425, lat: 64.788, lon: -22.014, magnitude: 0.3, depth: 20, time: "2026-02-02T09:13:46" },
    { event_id: 1429426, lat: 64.811, lon: -21.882, magnitude: 1.0, depth: 20, time: "2026-02-02T09:16:25" },
    { event_id: 1429427, lat: 64.593, lon: -17.165, magnitude: 0.4, depth: 17, time: "2026-02-02T09:19:30" },
    { event_id: 1429428, lat: 64.506, lon: -17.684, magnitude: 1.4, depth: 7, time: "2026-02-02T09:46:13" },
    { event_id: 1429429, lat: 65.018, lon: -16.75, magnitude: 0.8, depth: 5, time: "2026-02-02T09:47:24" },
    { event_id: 1429430, lat: 63.982, lon: -19.311, magnitude: 1.2, depth: 0, time: "2026-02-02T10:02:08" },
    { event_id: 1429435, lat: 63.609, lon: -19.125, magnitude: 2.5, depth: 1, time: "2026-02-02T11:22:27" },
    { event_id: 1429436, lat: 63.612, lon: -19.156, magnitude: 0.7, depth: 12, time: "2026-02-02T11:24:13" },
    { event_id: 1429438, lat: 64.406, lon: -17.319, magnitude: 0.9, depth: 4, time: "2026-02-02T11:29:32" }
];

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

function formatDateLocal(date) {
    const pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return pad(date.getFullYear()) + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " +
        pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
}

function formatDateUTC(date) {
    const pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return pad(date.getUTCFullYear()) + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate()) + " " +
        pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes()) + ":" + pad(date.getUTCSeconds());
}

function latLonToPixelIceland(lat, lon, mapWidth, mapHeight) {
    if (lat === null || lon === null || !isFinite(lat) || !isFinite(lon)) return null;
    if (lat < ICELAND_LAT_MIN || lat > ICELAND_LAT_MAX || lon < ICELAND_LON_MIN || lon > ICELAND_LON_MAX) return null;
    const x = ((lon - ICELAND_LON_MIN) / (ICELAND_LON_MAX - ICELAND_LON_MIN)) * mapWidth;
    const y = ((ICELAND_LAT_MAX - lat) / (ICELAND_LAT_MAX - ICELAND_LAT_MIN)) * mapHeight;
    return { x: Math.round(x), y: Math.round(y) };
}

function parseQuakeFilterResponse(dataStr) {
    try {
        const arr = JSON.parse(dataStr);
        if (!arr || !Array.isArray(arr)) return [];
        const events = [];
        for (let i = 0; i < arr.length; i++) {
            const f = arr[i];
            if (!f || f.type !== "Feature") continue;
            const geom = f.geometry;
            const props = f.properties || {};
            if (!geom || !geom.coordinates || geom.coordinates.length < 2) continue;
            const lon = geom.coordinates[0];
            const lat = geom.coordinates[1];
            events.push({
                event_id: typeof props.event_id === "number" ? props.event_id : null,
                lat: lat,
                lon: lon,
                magnitude: typeof props.magnitude === "number" ? props.magnitude : null,
                depth: typeof props.depth === "number" ? props.depth : null,
                time: props.time || null
            });
        }
        return events;
    } catch (e) {
        global.logError("EarthquakeTracker parseQuakeFilter: " + e.message);
        return [];
    }
}

function parseEMSCResponse(dataStr) {
    try {
        const obj = JSON.parse(dataStr);
        if (!obj || !obj.features || !Array.isArray(obj.features)) return [];
        const events = [];
        for (let i = 0; i < obj.features.length; i++) {
            const f = obj.features[i];
            if (!f || f.type !== "Feature") continue;
            const geom = f.geometry;
            const props = f.properties || {};
            const coords = geom && geom.coordinates;
            if (!coords || coords.length < 2) continue;
            const lon = coords[0];
            const lat = coords[1];
            const unid = f.id || props.unid || "emsc_" + i;
            const eventId = "emsc:" + unid;
            events.push({
                event_id: eventId,
                lat: props.lat !== undefined ? props.lat : lat,
                lon: props.lon !== undefined ? props.lon : lon,
                magnitude: typeof props.mag === "number" ? props.mag : null,
                depth: typeof props.depth === "number" ? props.depth : null,
                time: props.time || null
            });
        }
        return events;
    } catch (e) {
        global.logError("EarthquakeTracker parseEMSC: " + e.message);
        return [];
    }
}

function dedupeEventsByLocationTime(events) {
    if (!events || events.length <= 1) return events || [];
    const seen = {};
    const result = [];
    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const lat = ev.lat !== null && isFinite(ev.lat) ? ev.lat.toFixed(3) : "";
        const lon = ev.lon !== null && isFinite(ev.lon) ? ev.lon.toFixed(3) : "";
        const timeStr = (ev.time || "").substring(0, 16);
        const key = lat + "_" + lon + "_" + timeStr;
        if (seen[key]) continue;
        seen[key] = true;
        result.push(ev);
    }
    return result;
}

function formatMagnitude(val) {
    if (val === null || !isFinite(val)) return "—";
    return val.toFixed(1);
}

function formatTime(isoStr) {
    if (!isoStr || typeof isoStr !== "string") return "—";
    try {
        const s = isoStr.trim();
        if (s.length < 16) return s;
        const utcStr = s.length >= 19 && s.indexOf("Z") < 0 && s.indexOf("+") < 0 ? s.replace(" ", "T") + "Z" : s;
        const date = new Date(utcStr);
        if (isNaN(date.getTime())) return s.substring(0, 16).replace("T", " ");
        const pad = function (n) { return n < 10 ? "0" + n : "" + n; };
        return pad(date.getFullYear()) + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " +
            pad(date.getHours()) + ":" + pad(date.getMinutes());
    } catch (e) {
        return "—";
    }
}

function formatDepth(km) {
    if (km === null || !isFinite(km)) return "—";
    return Math.round(km) + " km";
}

function getHoursSinceEvent(isoTime) {
    if (!isoTime || typeof isoTime !== "string") return 999;
    try {
        const s = isoTime.trim();
        const utcStr = s.length >= 19 && s.indexOf("Z") < 0 && s.indexOf("+") < 0 ? s + "Z" : s;
        const evDate = new Date(utcStr);
        if (isNaN(evDate.getTime())) return 999;
        return (Date.now() - evDate.getTime()) / (1000 * 60 * 60);
    } catch (e) {
        return 999;
    }
}

function getDaysSinceEvent(isoTime) {
    return getHoursSinceEvent(isoTime) / 24;
}

function getColorByAge(daysSince) {
    // Color by days: red (today) -> orange -> yellow -> lime -> cyan -> blue -> indigo -> violet (7+ days)
    if (daysSince < 0.25) return { r: 1, g: 0.15, b: 0.1, a: 0.95 };       // bright red
    if (daysSince < 0.5) return { r: 1, g: 0.4, b: 0.05, a: 0.93 };       // red-orange
    if (daysSince < 1) return { r: 1, g: 0.6, b: 0.1, a: 0.92 };         // orange
    if (daysSince < 2) return { r: 1, g: 0.85, b: 0.2, a: 0.9 };         // yellow
    if (daysSince < 3) return { r: 0.6, g: 1, b: 0.2, a: 0.9 };          // lime
    if (daysSince < 4) return { r: 0.2, g: 0.95, b: 0.9, a: 0.88 };      // cyan
    if (daysSince < 5) return { r: 0.15, g: 0.5, b: 1, a: 0.88 };       // blue
    if (daysSince < 6) return { r: 0.35, g: 0.2, b: 0.9, a: 0.85 };      // indigo
    if (daysSince < 7) return { r: 0.6, g: 0.2, b: 0.9, a: 0.85 };       // violet
    return { r: 0.5, g: 0.35, b: 0.7, a: 0.8 };                          // purple-grey (7+ days)
}

function getRadiusByMagnitude(mag) {
    // Scale radius from 2px (mag 0) to 8px (mag 5+)
    const m = mag !== null && isFinite(mag) ? Math.max(0, mag) : 0;
    const r = 2 + Math.min(m, 6) * 1.0;
    return Math.max(2, Math.min(8, Math.round(r)));
}

function filterEventsByTimeWindow(events, windowMin, referenceNowMs) {
    if (!events || !windowMin) return events || [];
    const now = referenceNowMs !== undefined ? referenceNowMs : Date.now();
    const cutoff = now - windowMin * 60 * 1000;
    return events.filter(function (ev) {
        if (!ev.time) return false;
        const s = String(ev.time).trim();
        const utcStr = s.length >= 19 && s.indexOf("Z") < 0 && s.indexOf("+") < 0 ? s.replace(" ", "T") + "Z" : s;
        const t = new Date(utcStr);
        return !isNaN(t.getTime()) && t.getTime() >= cutoff;
    });
}

function sortEventsByTimeDescending(events) {
    if (!events || events.length <= 1) return events || [];
    return events.slice().sort(function (a, b) {
        const parseTime = function (ev) {
            if (!ev || !ev.time) return 0;
            const s = String(ev.time).trim();
            const utcStr = s.length >= 19 && s.indexOf("Z") < 0 && s.indexOf("+") < 0 ? s.replace(" ", "T") + "Z" : s;
            const t = new Date(utcStr);
            return isNaN(t.getTime()) ? 0 : t.getTime();
        };
        return parseTime(b) - parseTime(a);
    });
}

function EarthquakeTrackerDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

EarthquakeTrackerDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.actor.set_style("background-color: transparent;");

        this.setHeader(_("Earthquake Tracker"));
        this._header_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], deskletId);
        this.theme = this.settings.getValue("theme") || "dark";
        this.widthPercent = parseInt(this.settings.getValue("widthPercent"), 10) || 10;
        this.updateInterval = Math.max(15, parseInt(this.settings.getValue("updateInterval"), 10) || 30);
        this.dataMode = this.settings.getValue("dataMode") || "demo";
        this.timeWindowMin = Math.max(60, Math.min(10080, parseInt(this.settings.getValue("timeWindowMin"), 10) || 60));
        const _sm = parseFloat(this.settings.getValue("sizeMin"));
        this.sizeMin = (!isNaN(_sm) && _sm >= 0) ? _sm : 0.5;
        this.showDepth = this.settings.getValue("showDepth") !== false;
        this.maxEventsDisplay = Math.max(3, parseInt(this.settings.getValue("maxEventsDisplay"), 10) || 5);

        const boundSettings = ["theme", "widthPercent", "dataMode", "updateInterval", "timeWindowMin", "sizeMin", "showDepth", "maxEventsDisplay"];
        boundSettings.forEach(function (key) {
            this.settings.bindProperty(Settings.BindingDirection.IN, key, key, this.on_settings_changed, null);
        }, this);

        this._deskletPath = GLib.get_home_dir() + "/.local/share/cinnamon/desklets/" + this.metadata["uuid"] + "/";
        this._quakeEvents = [];
        this._seenEventIds = {};
        this._imageWidth = null;
        this._imageHeight = null;
        this._timeout = null;
        this._fetchInProgress = false;

        this._buildUI();
        this._applyWidth();
        if (this.dataMode === "demo") {
            this._loadDemoData();
        } else {
            this._fetchQuakes();
        }
    },

    _buildUI: function () {
        this.container = new St.BoxLayout({ vertical: true, style_class: "earthquake-desklet-container", x_align: Clutter.ActorAlign.FILL });
        this.titleLabel = new St.Label({
            text: _("Earthquake Tracker"),
            style_class: "earthquake-desklet-title",
            x_align: Clutter.ActorAlign.CENTER
        });
        this._applyTitleStyle();
        this.titleLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        this.container.add_child(this.titleLabel);

        this.mapBin = new St.Bin({ x_expand: true, style_class: "earthquake-map-container" });
        this.overlayActor = new Clutter.Actor({ x_expand: true });
        this.overlayActor.set_reactive(false);

        this._buildQuakeCanvas();
        if (this.quakeCanvas) {
            this.quakeCanvas.set_position(0, 0);
            this.overlayActor.add_actor(this.quakeCanvas);
        }

        this.mapBin.set_child(this.overlayActor);
        this.container.add_child(this.mapBin);

        const coordsClass = this.theme === "light" ? "earthquake-coords-panel-light" : "earthquake-coords-panel-dark";
        this.coordsPanel = new St.BoxLayout({ vertical: true, style_class: "earthquake-coords-panel " + coordsClass, x_expand: true, x_align: Clutter.ActorAlign.FILL });
        this.coordsPanel.set_clip_to_allocation(true);
        this.container.add_child(this.coordsPanel);

        this.setContent(this.container);
    },

    _buildQuakeCanvas: function () {
        this.quakeCanvas = null;
        try {
            if (typeof Clutter.Canvas === "undefined") throw new Error("Clutter.Canvas not available");
            const w = this._getWidthPx();
            const h = Math.ceil(w * 0.7);
            const canvas = new Clutter.Canvas();
            canvas.set_size(w, h);
            canvas.connect("draw", Lang.bind(this, this._onQuakeDraw));
            const actor = new Clutter.Actor({ width: w, height: h, x_expand: true });
            actor.set_content(canvas);
            actor.set_reactive(false);
            this.quakeCanvas = actor;
        } catch (e) {
            global.logError("EarthquakeTracker quake canvas: " + e.message);
        }
    },

    _onQuakeDraw: function (content, cr, width, height) {
        cr.save();
        cr.setOperator(3);
        cr.setSourceRGBA(0, 0, 0, 0);
        cr.paint();
        cr.restore();

        if (!this._quakeEvents || this._quakeEvents.length === 0) return;

        cr.save();
        for (let i = 0; i < this._quakeEvents.length; i++) {
            const ev = this._quakeEvents[i];
            const pos = latLonToPixelIceland(ev.lat, ev.lon, width, height);
            if (!pos) continue;
            const mag = ev.magnitude;
            const radius = getRadiusByMagnitude(mag);
            const daysSince = getDaysSinceEvent(ev.time);
            const c = getColorByAge(daysSince);
            cr.setSourceRGBA(c.r, c.g, c.b, c.a);
            cr.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
            cr.fill();
        }
        cr.restore();
    },

    _updateQuakeCanvas: function () {
        if (!this.quakeCanvas) return;
        const content = this.quakeCanvas.get_content();
        if (content && typeof content.invalidate === "function") {
            content.invalidate();
        }
    },

    _loadDemoData: function () {
        const filtered = filterEventsByTimeWindow(DEMO_QUAKE_EVENTS.slice(), this.timeWindowMin, Date.now());
        this._quakeEvents = sortEventsByTimeDescending(filtered.length > 0 ? filtered : DEMO_QUAKE_EVENTS.slice());
        this._seenEventIds = {};
        for (let i = 0; i < this._quakeEvents.length; i++) {
            const ev = this._quakeEvents[i];
            if (ev.event_id !== null) this._seenEventIds[ev.event_id] = true;
        }
        this._updateQuakeCanvas();
        this._refreshCoords();
    },

    _mergeQuakeEvents: function (newEvents) {
        for (let i = 0; i < newEvents.length; i++) {
            const ev = newEvents[i];
            if (ev.event_id !== null && !this._seenEventIds[ev.event_id]) {
                this._seenEventIds[ev.event_id] = true;
                this._quakeEvents.unshift(ev);
            } else if (ev.event_id === null) {
                this._quakeEvents.unshift(ev);
            }
        }
        const filtered = filterEventsByTimeWindow(this._quakeEvents, this.timeWindowMin, Date.now());
        this._quakeEvents = sortEventsByTimeDescending(filtered.length > 0 ? filtered : this._quakeEvents);
        const maxKeep = 50;
        while (this._quakeEvents.length > maxKeep) {
            const old = this._quakeEvents.pop();
            if (old.event_id !== null) delete this._seenEventIds[old.event_id];
        }
        this._updateQuakeCanvas();
        this._refreshCoords();
    },

    _replaceQuakeEvents: function (newEvents) {
        const filtered = filterEventsByTimeWindow(newEvents || [], this.timeWindowMin, Date.now());
        this._quakeEvents = sortEventsByTimeDescending(filtered.length > 0 ? filtered : []);
        this._seenEventIds = {};
        for (let i = 0; i < this._quakeEvents.length; i++) {
            const ev = this._quakeEvents[i];
            if (ev.event_id !== null) this._seenEventIds[ev.event_id] = true;
        }
        this._updateQuakeCanvas();
        this._refreshCoords();
    },

    _updateImageDimensions: function () {
        this._imageWidth = null;
        this._imageHeight = null;
        try {
            const path = this._deskletPath + "iceland.png";
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
        const mapPath = this._deskletPath + "iceland.png";
        let uri;
        try {
            uri = GLib.filename_to_uri(mapPath, null);
        } catch (e) {
            uri = "file://" + encodeURI(mapPath);
        }
        const size = (widthPx && heightPx) ? (widthPx + "px " + heightPx + "px") : "contain";
        return "background-image: url('" + uri + "'); background-size: " + size + "; background-repeat: no-repeat; background-position: center center;";
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
                : Math.ceil(w * 0.7);
            this.mapBin.set_style(this._getMapStyle(w, mapHeight) + " min-height: " + mapHeight + "px; height: " + mapHeight + "px;");
            this.mapBin.set_clip_to_allocation(true);
            if (this.overlayActor) {
                this.overlayActor.set_size(w, mapHeight);
                if (this.quakeCanvas) {
                    this.quakeCanvas.set_size(w, mapHeight);
                    const content = this.quakeCanvas.get_content();
                    if (content && content.set_size) {
                        content.set_size(w, mapHeight);
                    }
                    this._updateQuakeCanvas();
                }
            }
        }
    },

    _refreshCoords: function () {
        if (!this.coordsPanel) return;
        while (this.coordsPanel.get_n_children() > 0) {
            this.coordsPanel.remove_child(this.coordsPanel.get_child_at_index(0));
        }

        const events = this._quakeEvents;
        const color = this.theme === "light" ? "#1a1a1a" : "#e5e5e5";
        const style = "color: " + color + "; font-size: 11px;";

        if (!events || events.length === 0) {
            const noData = new St.Label({ text: _("No quakes"), style: style });
            this.coordsPanel.add_child(noData);
            return;
        }

        const maxShow = Math.min(events.length, this.maxEventsDisplay || 5);
        for (let i = 0; i < maxShow; i++) {
            const ev = events[i];
            const row = new St.BoxLayout({ vertical: false, style_class: "earthquake-coord-row" });
            const magText = "M " + formatMagnitude(ev.magnitude);
            const detailParts = [formatTime(ev.time)];
            if (this.showDepth) detailParts.push(formatDepth(ev.depth));
            const detailText = detailParts.join(" · ");
            const lbl = new St.Label({ text: magText + " ", style: style + " font-weight: 600;" });
            const val = new St.Label({ text: detailText, style: style });
            val.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            row.add_child(lbl);
            row.add_child(val);
            this.coordsPanel.add_child(row);
        }
    },

    _fetchQuakes: function (retryAttempt) {
        retryAttempt = retryAttempt || 0;
        if (this._fetchInProgress) return;

        this._fetchInProgress = true;
        const now = new Date();
        const endDate = new Date(now.getTime());
        const startDate = new Date(now.getTime() - this.timeWindowMin * 60 * 1000);
        const startIso = startDate.toISOString().substring(0, 19);
        const endIso = endDate.toISOString().substring(0, 19);

        const sizeMinVal = typeof this.sizeMin === "number" ? this.sizeMin : parseFloat(this.sizeMin);
        const body = {
            start_time: formatDateUTC(startDate),
            end_time: formatDateUTC(endDate),
            size_min: (!isNaN(sizeMinVal) && sizeMinVal >= 0) ? sizeMinVal : 0.5,
            area: ICELAND_AREA,
            event_type: ["qu"],
            originating_system: ["SIL picks", "SIL aut.mag"],
            magnitude_preference: ["Mlw"]
        };

        const bodyStr = JSON.stringify(body);
        const tmpPath = this._deskletPath + "quake_request.json";
        const tmpFile = Gio.File.new_for_path(tmpPath);

        try {
            tmpFile.replace_contents(bodyStr, null, false, Gio.FileCreateFlags.NONE, null);
        } catch (e) {
            this._fetchInProgress = false;
            global.logError("EarthquakeTracker write tmp: " + e.message);
            this._refreshCoords();
            this._scheduleNextFetch();
            return;
        }

        const self = this;
        const results = { vedur: [], emsc: [] };
        let pending = 2;

        function onBothDone() {
            self._fetchInProgress = false;
            try {
                const combined = results.vedur.concat(results.emsc);
                const deduped = dedupeEventsByLocationTime(combined);
                self._mergeQuakeEvents(deduped);
            } catch (e) {
                global.logError("EarthquakeTracker merge: " + e.message);
                self._refreshCoords();
            }
            self._scheduleNextFetch();
        }

        function checkDone() {
            pending--;
            if (pending <= 0) onBothDone();
        }

        const emscUrl = EMSC_API_BASE + "?format=json&minlatitude=63&maxlatitude=67&minlongitude=-25&maxlongitude=-13&limit=100&orderby=time-desc&starttime=" + startIso + "&endtime=" + endIso;
        const emscFile = Gio.File.new_for_uri(emscUrl);
        emscFile.load_contents_async(null, Lang.bind(this, function (f, res) {
            try {
                const [ok, contents] = f.load_contents_finish(res);
                if (ok && contents) {
                    const str = (typeof imports.byteArray !== "undefined") ? imports.byteArray.toString(contents) : (typeof contents === "string" ? contents : contents.toString());
                    results.emsc = parseEMSCResponse(str);
                }
            } catch (e) {
                global.logError("EarthquakeTracker EMSC fetch: " + e.message);
            }
            checkDone();
        }));

        const argv = ["curl", "-s", "-X", "POST", QUAKE_API_URL,
            "-H", "Content-Type: application/json", "-H", "Accept: application/json",
            "-d", "@" + tmpPath];
        try {
            const proc = new Gio.Subprocess({
                argv: argv,
                flags: Gio.SubprocessFlags.STDOUT_PIPE
            });
            proc.init(null);
            proc.communicate_utf8_async(null, null, Lang.bind(this, function (subproc, res) {
                try {
                    const [ok, stdout, stderr] = subproc.communicate_utf8_finish(res);
                    if (!ok) throw new Error("curl failed");
                    const dataStr = stdout || "[]";
                    const parsed = JSON.parse(dataStr);
                    if (parsed && typeof parsed.status === "number" && parsed.status >= 400) {
                        throw new Error("API: " + (parsed.detail || parsed.title || "Bad Request"));
                    }
                    results.vedur = Array.isArray(parsed) ? parseQuakeFilterResponse(dataStr) : [];
                } catch (e) {
                    global.logError("EarthquakeTracker Vedur fetch: " + e.message);
                    if (retryAttempt < 2) {
                        this._fetchInProgress = false;
                        Mainloop.timeout_add_seconds(RETRY_DELAY_SEC, Lang.bind(this, function () {
                            this._fetchQuakes(retryAttempt + 1);
                            return false;
                        }));
                        checkDone();
                        return;
                    }
                }
                checkDone();
            }));
        } catch (e) {
            this._fetchInProgress = false;
            global.logError("EarthquakeTracker Subprocess: " + e.message);
            checkDone();
        }
    },

    _scheduleNextFetch: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
        if (this.dataMode !== "live") return;
        const interval = Math.max(15, parseInt(this.updateInterval, 10) || 30);
        this._timeout = Mainloop.timeout_add_seconds(interval, Lang.bind(this, function () {
            this._fetchQuakes();
            return false;
        }));
    },

    on_settings_changed: function () {
        this.theme = this.settings.getValue("theme") || "dark";
        this.dataMode = this.settings.getValue("dataMode") || "demo";
        this.updateInterval = Math.max(15, parseInt(this.settings.getValue("updateInterval"), 10) || 30);
        this.timeWindowMin = Math.max(60, Math.min(10080, parseInt(this.settings.getValue("timeWindowMin"), 10) || 60));
        const _sm = parseFloat(this.settings.getValue("sizeMin"));
        this.sizeMin = (!isNaN(_sm) && _sm >= 0) ? _sm : 0.5;
        this.showDepth = this.settings.getValue("showDepth") !== false;
        this.maxEventsDisplay = Math.max(3, parseInt(this.settings.getValue("maxEventsDisplay"), 10) || 5);

        this._applyWidth();
        this._applyTitleStyle();

        const coordsClass = this.theme === "light" ? "earthquake-coords-panel-light" : "earthquake-coords-panel-dark";
        this.coordsPanel.remove_style_class_name("earthquake-coords-panel-light");
        this.coordsPanel.remove_style_class_name("earthquake-coords-panel-dark");
        this.coordsPanel.add_style_class_name(coordsClass);

        if (this.dataMode === "demo") {
            this._loadDemoData();
        } else {
            this._quakeEvents = [];
            this._seenEventIds = {};
            if (this._fetchInProgress) {
                Mainloop.timeout_add_seconds(2, Lang.bind(this, function () {
                    this._fetchQuakes();
                    return false;
                }));
            } else {
                this._fetchQuakes();
            }
        }
        this._scheduleNextFetch();
    },

    on_desklet_added_to_desktop: function () {
        if (this.dataMode === "live") this._scheduleNextFetch();
    },

    on_desklet_removed: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
        this._quakeEvents = [];
        this._seenEventIds = {};
        this._fetchInProgress = false;
    }
};

function main(metadata, deskletId) {
    return new EarthquakeTrackerDesklet(metadata, deskletId);
}
