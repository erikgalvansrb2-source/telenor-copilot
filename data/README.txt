Natural Earth dataset (110m) integration
=======================================

This build will look for a local file at `data/ne_110m_land.geojson` first.
If it's missing, it falls back to the public CDN copy hosted by geojson.xyz (CloudFront):
  https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_land.geojson

You can also load a custom GeoJSON at runtime via the **Load land GeoJSON…** button.

For production and offline use, place the file in `data/ne_110m_land.geojson`.
(Recommended source: Natural Earth 110m Land. See https://www.naturalearthdata.com/downloads/110m-physical-vectors/)
