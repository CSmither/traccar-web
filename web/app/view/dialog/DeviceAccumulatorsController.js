/*
 * Copyright 2016 - 2018 Anton Tananaev (anton@traccar.org)
 * Copyright 2016 - 2018 Andrey Kunitsyn (andrey@traccar.org)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

Number.prototype.toRad = function () {  // convert degrees to radians
    return this * Math.PI / 180;
}
Number.prototype.toDeg = function () {  // convert radians to degrees (signed)
    return this * 180 / Math.PI;
}

/*
 * pad a number with sufficient leading zeros to make it w chars wide
 */
Number.prototype.padLZ = function (w) {
    var n = this.toString();
    for (var i = 0; i < w - n.length; i++) n = '0' + n;
    return n;
}

function LatLongToOSGrid(lon, lat, accuracy) {
    // Swap lat lon as they seem to be the wron way round?
    var lat = lat.toRad(), lon = lon.toRad();
    var a = 6377563.396, b = 6356256.910;          // Airy 1830 major & minor semi-axes
    var F0 = 0.9996012717;                         // NatGrid scale factor on central meridian
    // var F0 = 0.9996;                         // NatGrid scale factor on central meridian    
    var lat0 = (49).toRad(), lon0 = (-2).toRad();  // NatGrid true origin
    var N0 = -100000, E0 = 400000;                 // northing & easting of true origin, metres
    var e2 = 1 - (b * b) / (a * a);                      // eccentricity squared
    var n = (a - b) / (a + b), n2 = n * n, n3 = n * n * n;

    var cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    var nu = a * F0 / Math.sqrt(1 - e2 * sinLat * sinLat);              // transverse radius of curvature
    var rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);  // meridional radius of curvature
    var eta2 = nu / rho - 1;

    var Ma = (1 + n + (5 / 4) * n2 + (5 / 4) * n3) * (lat - lat0);
    var Mb = (3 * n + 3 * n * n + (21 / 8) * n3) * Math.sin(lat - lat0) * Math.cos(lat + lat0);
    var Mc = ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0));
    var Md = (35 / 24) * n3 * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0));
    var M = b * F0 * (Ma - Mb + Mc - Md);              // meridional arc

    var cos3lat = cosLat * cosLat * cosLat;
    var cos5lat = cos3lat * cosLat * cosLat;
    var tan2lat = Math.tan(lat) * Math.tan(lat);
    var tan4lat = tan2lat * tan2lat;

    var I = M + N0;
    var II = (nu / 2) * sinLat * cosLat;
    var III = (nu / 24) * sinLat * cos3lat * (5 - tan2lat + 9 * eta2);
    var IIIA = (nu / 720) * sinLat * cos5lat * (61 - 58 * tan2lat + tan4lat);
    var IV = nu * cosLat;
    var V = (nu / 6) * cos3lat * (nu / rho - tan2lat);
    var VI = (nu / 120) * cos5lat * (5 - 18 * tan2lat + tan4lat + 14 * eta2 - 58 * tan2lat * eta2);

    var dLon = lon - lon0;
    var dLon2 = dLon * dLon, dLon3 = dLon2 * dLon, dLon4 = dLon3 * dLon, dLon5 = dLon4 * dLon, dLon6 = dLon5 * dLon;

    var N = I + II * dLon2 + III * dLon4 + IIIA * dLon6;
    var E = E0 + IV * dLon + V * dLon3 + VI * dLon5;

    // Hacky correction put in by Smither to make it work :/ I hate this
    E=E+100
    N=N-18

    return gridrefNumToLet(E, N, accuracy);
}

/*
 * convert numeric grid reference (in metres) to standard-form grid ref
 */
function gridrefNumToLet(e, n, digits) {
    // get the 100km-grid indices
    var e100k = Math.floor(e / 100000), n100k = Math.floor(n / 100000);

    if (e100k < 0 || e100k > 6 || n100k < 0 || n100k > 12) return '';

    // translate those into numeric equivalents of the grid letters
    var l1 = (19 - n100k) - (19 - n100k) % 5 + Math.floor((e100k + 10) / 5);
    var l2 = (19 - n100k) * 5 % 25 + e100k % 5;

    // compensate for skipped 'I' and build grid letter-pairs
    if (l1 > 7) l1++;
    if (l2 > 7) l2++;
    var letPair = String.fromCharCode(l1 + 'A'.charCodeAt(0), l2 + 'A'.charCodeAt(0));

    // strip 100km-grid indices from easting & northing, and reduce precision
    e = Math.floor((e % 100000) / Math.pow(10, 5 - digits / 2));
    n = Math.floor((n % 100000) / Math.pow(10, 5 - digits / 2));

    var gridRef = letPair + " " + e.padLZ(digits / 2) + " " + n.padLZ(digits / 2);

    return gridRef;
}

Ext.define('Traccar.view.dialog.DeviceAccumulatorsController', {
    extend: 'Ext.app.ViewController',
    alias: 'controller.deviceAccumulators',

    onSetClick: function () {
        var totalDistance, hours, data = {
            deviceId: this.getView().deviceId
        };
        const coordinate = [data.lat,data.lon];
        console.log(coordinate)
        data.osGridRef = LatLongToOSGrid(data.lat,data.lon, 8);
        totalDistance = this.lookupReference('totalDistance');
        if (!isNaN(totalDistance.getRawValue())) {
            data.totalDistance = totalDistance.getValue();
        }
        hours = this.lookupReference('hours');
        if (!isNaN(hours.getRawValue())) {
            data.hours = hours.getValue();
        }
        Ext.Ajax.request({
            scope: this,
            method: 'PUT',
            url: 'api/devices/' + data.deviceId + '/accumulators',
            jsonData: Ext.util.JSON.encode(data),
            callback: function (options, success, response) {
                if (!success) {
                    Traccar.app.showError(response);
                }
            }
        });
        this.closeView();
    }
});
