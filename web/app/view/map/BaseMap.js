/*
 * Copyright 2016 - 2021 Anton Tananaev (anton@traccar.org)
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


/*
 * extend Number object with methods for converting degrees/radians
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

Ext.define('Traccar.view.map.BaseMap', {
    extend: 'Ext.panel.Panel',
    xtype: 'baseMapView',

    layout: 'fit',

    getMap: function () {
        return this.map;
    },

    getMapView: function () {
        return this.mapView;
    },

    initMap: function () {
        var server, layer, type, bingKey, oskey, locationIqKey, lat, lon, zoom, maxZoom, target, poiLayer, self = this;

        server = Traccar.app.getServer();

        type = Traccar.app.getPreference('map', null);
        bingKey = server.get('bingKey');
        oskey = server.get('osKey');
        locationIqKey = Traccar.app.getAttributePreference('locationIqKey', 'pk.0f147952a41c555a5b70614039fd148b');

        layer = new ol.layer.Group({
            title: Strings.mapLayer,
            layers: [
                new ol.layer.Tile({
                    title: Strings.mapOsleisure,
                    type: 'base',
                    visible: type === 'osleisure',
                    source: new ol.source.XYZ({
                        url: 'https://api.os.uk/maps/raster/v1/zxy/Leisure_27700/{z}/{x}/{y}.png?key=' + oskey,
                        projection: 'EPSG:27700',
                        tileGrid: new ol.tilegrid.TileGrid({
                            resolutions: [896.0, 448.0, 224.0, 112.0, 56.0, 28.0, 14.0, 7.0, 3.5, 1.75],
                            origin: [-238375.0, 1376256.0]
                        }),
                        attributions: '&copy; <a href="https://osmaps.ordnancesurvey.co.uk/">Ordnance Survey Leisure_27700</a>'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapOsoutdoor,
                    type: 'base',
                    visible: type === 'osoutdoor',
                    source: new ol.source.XYZ({
                        url: 'https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/{z}/{x}/{y}.png?key=' + oskey,
                        projection: 'EPSG:3857',
                        attributions: '&copy; <a href="https://osmaps.ordnancesurvey.co.uk/">Ordnance Survey Outdoor_38570</a>'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapOsroad,
                    type: 'base',
                    visible: type === 'osroad',
                    source: new ol.source.XYZ({
                        url: 'https://api.os.uk/maps/raster/v1/zxy/Road_3857/{z}/{x}/{y}.png?key=' + oskey,
                        projection: 'EPSG:3857',
                        attributions: '&copy; <a href="https://osmaps.ordnancesurvey.co.uk/">Ordnance Survey Road_3857</a>'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapCustom,
                    type: 'base',
                    visible: type === 'custom',
                    source: new ol.source.XYZ({
                        url: Ext.String.htmlDecode(server.get('mapUrl')),
                        attributions: ''
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapCustomArcgis,
                    type: 'base',
                    visible: type === 'customArcgis',
                    source: new ol.source.TileArcGISRest({
                        url: Ext.String.htmlDecode(server.get('mapUrl'))
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapBingRoad,
                    type: 'base',
                    visible: type === 'bingRoad',
                    source: new ol.source.BingMaps({
                        key: bingKey,
                        imagerySet: 'Road'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapBingAerial,
                    type: 'base',
                    visible: type === 'bingAerial',
                    source: new ol.source.BingMaps({
                        key: bingKey,
                        imagerySet: 'Aerial'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapBingHybrid,
                    type: 'base',
                    visible: type === 'bingHybrid',
                    source: new ol.source.BingMaps({
                        key: bingKey,
                        imagerySet: 'AerialWithLabels'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapCarto,
                    type: 'base',
                    visible: type === 'carto',
                    source: new ol.source.XYZ({
                        url: 'https://cartodb-basemaps-{a-d}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
                        attributions: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
                            'contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapAutoNavi,
                    type: 'base',
                    visible: type === 'autoNavi' || type === 'baidu',
                    source: new ol.source.OSM({
                        url: 'https://webrd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapYandexMap,
                    type: 'base',
                    visible: type === 'yandexMap',
                    source: new ol.source.XYZ({
                        url: 'https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}',
                        projection: 'EPSG:3395',
                        attributions: '&copy; <a href="https://yandex.com/maps/">Yandex</a>'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapYandexSat,
                    type: 'base',
                    visible: type === 'yandexSat',
                    source: new ol.source.XYZ({
                        url: 'https://core-sat.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}',
                        projection: 'EPSG:3395',
                        attributions: '&copy; <a href="https://yandex.com/maps/">Yandex</a>'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapOsm,
                    type: 'base',
                    visible: type === 'osm',
                    source: new ol.source.OSM({})
                }),
                new ol.layer.Tile({
                    title: Strings.mapLocationIqHybrid,
                    type: 'base',
                    visible: type === 'locationIqHybrid',
                    source: new ol.source.XYZ({
                        url: 'https://{a-c}-tiles.locationiq.com/v3/hybrid/r/{z}/{x}/{y}.jpg?key=' + locationIqKey,
                        attributions: '&copy; <a href="https://locationiq.com/">LocationIQ</a>'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapLocationIqEarth,
                    type: 'base',
                    visible: type === 'locationIqEarth',
                    source: new ol.source.XYZ({
                        url: 'https://{a-c}-tiles.locationiq.com/v3/earth/r/{z}/{x}/{y}.jpg?key=' + locationIqKey,
                        attributions: '&copy; <a href="https://locationiq.com/">LocationIQ</a>'
                    })
                }),
                new ol.layer.Tile({
                    title: Strings.mapLocationIqStreets,
                    type: 'base',
                    visible: type === 'locationIqStreets' || type === 'wikimedia' || !type,
                    source: new ol.source.XYZ({
                        url: 'https://{a-c}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=' + locationIqKey,
                        attributions: '&copy; <a href="https://locationiq.com/">LocationIQ</a>'
                    })
                })
            ]
        });

        lat = Traccar.app.getPreference('latitude', Traccar.Style.mapDefaultLat);
        lon = Traccar.app.getPreference('longitude', Traccar.Style.mapDefaultLon);
        zoom = Traccar.app.getPreference('zoom', Traccar.Style.mapDefaultZoom);
        maxZoom = Traccar.app.getAttributePreference('web.maxZoom', Traccar.Style.mapMaxZoom);

        this.mapView = new ol.View({
            center: ol.proj.fromLonLat([lon, lat]),
            zoom: zoom,
            maxZoom: maxZoom
        });

        this.mousePositionControl = new ol.control.MousePosition({
            coordinateFormat: function (latlon, accuracy) {
                const coordinate = latlon;
                const gridref = LatLongToOSGrid(...coordinate, 8);
                return (gridref);
            },
            placeholder: false,
            projection: 'EPSG:4326',
            // comment the following two lines to have the mouse position
            // be placed within the map.
            // className: 'custom-mouse-position',
            // target: document.getElementById('mouse-position'),
        });

        this.map = new ol.Map({
            target: this.body.dom.id,
            layers: [layer],
            controls: ol.control.defaults().extend([this.mousePositionControl]),
            view: this.mapView
        });

        poiLayer = Traccar.app.getPreference('poiLayer', null);

        if (poiLayer) {
            this.map.addLayer(new ol.layer.Vector({
                source: new ol.source.Vector({
                    url: poiLayer,
                    format: new ol.format.KML()
                })
            }));
        }

        switch (Traccar.app.getAttributePreference('distanceUnit', 'km')) {
            case 'mi':
                this.map.addControl(new ol.control.ScaleLine({
                    units: 'us'
                }));
                break;
            case 'nmi':
                this.map.addControl(new ol.control.ScaleLine({
                    units: 'nautical'
                }));
                break;
            default:
                this.map.addControl(new ol.control.ScaleLine());
                break;
        }

        this.map.addControl(new ol.control.LayerSwitcher());

        target = this.map.getTarget();
        if (typeof target === 'string') {
            target = Ext.get(target).dom;
        }

        this.map.on('pointermove', function (e) {
            var hit = this.forEachFeatureAtPixel(e.pixel, function () {
                return true;
            });
            if (hit) {
                target.style.cursor = 'pointer';
            } else {
                target.style.cursor = '';
            }
        });

        this.map.on('click', function (e) {
            var i, features = self.map.getFeaturesAtPixel(e.pixel, {
                layerFilter: function (layer) {
                    return !layer.get('name');
                }
            });
            if (features) {
                for (i = 0; i < features.length; i++) {
                    self.fireEvent('selectfeature', features[i]);
                }
            } else {
                self.fireEvent('deselectfeature');
            }
        });

        this.map.once('postrender', function () {
            self.fireEvent('mapready');
        });
    },

    listeners: {
        afterrender: function () {
            this.initMap();
        },

        resize: function () {
            this.map.updateSize();
        }
    }
}, function () {
    var projection;
    proj4.defs('EPSG:3395', '+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs');
    proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs');
    ol.proj.proj4.register(proj4);
    projection = ol.proj.get('EPSG:3395');
    if (projection) {
        projection.setExtent([-20037508.342789244, -20037508.342789244, 20037508.342789244, 20037508.342789244]);
    }
});
