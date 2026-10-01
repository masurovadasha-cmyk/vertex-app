# Geo / Routing

H3 is the primary spatial bucketing layer for supply/demand, heatmaps, zones and candidate discovery. Exact H3 resolution is market/load configurable.

PostGIS stores canonical coordinates/polygons and performs exact geographic filtering. Use indexed `ST_DWithin` for radius checks after H3 discovery.

Routing adapter: `route`, `matrix`, `eta`, `geocode`, `reverseGeocode`, `snapToRoad`. Providers are replaceable. Routing failure triggers cached/approximate ETA and controlled degradation; it cannot corrupt ride state.
