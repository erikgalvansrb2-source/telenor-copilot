Dataset options
==============

This build includes a tiny **sample** land dataset at `data/sample_land.geojson` (Sicily & Mallorca, very rough),
so the **Compute 12 km zone** button works immediately if you pan to those regions.

For production, replace it with a full land dataset at:

  data/ne_110m_land.geojson

(Example source: Natural Earth “Land” 1:110m, converted to GeoJSON.)

The app will try to load `ne_110m_land.geojson` first; if it is missing, it falls back to `sample_land.geojson`.
You can also use the **Load land GeoJSON…** button to pick a file at runtime without redeploying.
