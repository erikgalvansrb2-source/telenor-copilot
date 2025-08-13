/* Telenor Maritime – LTE 12 km compliance map (Natural Earth 110m fallback + SW cache) */
(() => {
  const LTE_MIN_DISTANCE_KM = 12;

  // --- DOM refs ---
  const $status = () => document.getElementById('statusText');
  const $shoreDist = () => document.getElementById('shoreDist');
  const $margin = () => document.getElementById('margin');
  const $accuracy = () => document.getElementById('accuracy');
  const $kmValue = () => document.getElementById('kmValue');

  // --- Map state ---
  let map, drawingManager;
  let userMarker = null, accuracyCircle = null, watchId = null;
  let drawnCoastlines = [];            // array<google.maps.Polyline>
  let exclusionDataLayer = null;       // google.maps.Data layer with 12km buffer polygon(s)
  let exclusionGeoJSON = null;         // turf geojson buffer (12km)

  // --- Land dataset state ---
  let landDataset = null; // turf FeatureCollection (land polygons)

  // Detect base path (works on GitHub Pages subfolders)
  function getBasePath() {
    const path = window.location.pathname; // e.g., /telenor-copilot/index.html
    return path.endsWith('/') ? path : path.replace(/\/[^/]*$/, '/');
  }
  const BASE = getBasePath();

  // Public CDN copy of Natural Earth 110m land (GeoJSON via geojson.xyz CDN)
  const NE110M_CDN = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_land.geojson';

  // Candidate URLs in priority order (local first, then CDN, then tiny sample)
  const LAND_URLS = [
    BASE + 'data/ne_110m_land.geojson',
    NE110M_CDN,
    BASE + 'data/sample_land.geojson'
  ];

  // Read API key from local file and then load Google Maps JS API dynamically
  fetch('api-key 1.txt')
    .then(r => r.text())
    .then(text => text.trim())
    .then(key => loadGoogleMaps(key))
    .catch(err => {
      console.error('Failed to read API key from "api-key 1.txt".', err);
      alert('Could not read "api-key 1.txt". Put your Google Maps API key in that file (single line).');
    });

  function loadGoogleMaps(key) {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry,drawing&callback=initMap`;
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  // Called by Google Maps when it loads
  window.initMap = function initMap() {
    $kmValue().textContent = `${LTE_MIN_DISTANCE_KM} km`;

    map = new google.maps.Map(document.getElementById('map'), {
      mapId: 'TelenorMaritimeLTE',
      center: { lat: 0, lng: 0 },
      zoom: 2,
      mapTypeId: 'hybrid',
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: 'greedy'
    });

    // Data layer for exclusion zone polygons (12 km buffer)
    exclusionDataLayer = new google.maps.Data({ map });
    exclusionDataLayer.setStyle({
      fillColor: '#ff5c7a',
      fillOpacity: 0.18,
      strokeColor: '#ff5c7a',
      strokeWeight: 1.5,
    });

    // Drawing manager for user‑drawn coastline polylines
    drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polylineOptions: {
        strokeColor: '#00c7b7',
        strokeWeight: 3
      }
    });
    drawingManager.setMap(map);

    google.maps.event.addListener(drawingManager, 'polylinecomplete', (poly) => {
      drawnCoastlines.push(poly);
      updateZoneFromDrawnCoastlines();
      poly.addListener('rightclick', () => {
        poly.setMap(null);
        drawnCoastlines = drawnCoastlines.filter(p => p !== poly);
        updateZoneFromDrawnCoastlines();
      });
    });

    // UI hookups
    document.getElementById('btnDrawCoast').addEventListener('click', () => {
      drawingManager.setDrawingMode(
        drawingManager.getDrawingMode() ? null : google.maps.drawing.OverlayType.POLYLINE
      );
    });
    document.getElementById('btnClear').addEventListener('click', clearAll);
    document.getElementById('btnUseLocation').addEventListener('click', useMyLocation);
    document.getElementById('btnComputeView').addEventListener('click', computeZoneForCurrentView);

    const fileInput = document.getElementById('fileLand');
    document.getElementById('btnLoadLand').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        if (!json || !json.type) throw new Error('Not a valid GeoJSON file');
        landDataset = json;
        $status().textContent = 'Land dataset loaded from file.';
      } catch (e) {
        alert('Failed to load GeoJSON: ' + e.message);
      }
    });

    useMyLocation();
  };

  // --- Geolocation ---
  function useMyLocation() {
    if (!navigator.geolocation) {
      $status().textContent = 'Geolocation not supported in this browser.';
      return;
    }
    if (watchId) navigator.geolocation.clearWatch(watchId);

    watchId = navigator.geolocation.watchPosition(onPos, onPosErr, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 12000
    });
  }

  function onPos(pos) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const p = new google.maps.LatLng(lat, lng);

    if (!userMarker) {
      userMarker = new google.maps.Marker({
        map,
        position: p,
        title: 'Your position',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: '#49a0ff',
          fillOpacity: 0.9,
          strokeWeight: 2,
          strokeColor: '#ffffff'
        }
      });
      map.setCenter(p);
      map.setZoom(8);
    } else {
      userMarker.setPosition(p);
    }

    if (!accuracyCircle) {
      accuracyCircle = new google.maps.Circle({
        map,
        strokeColor: '#49a0ff',
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: '#49a0ff',
        fillOpacity: 0.12,
        center: p,
        radius: accuracy || 50
      });
    } else {
      accuracyCircle.setCenter(p);
      accuracyCircle.setRadius(accuracy || 50);
    }

    $accuracy().textContent = accuracy ? `${accuracy.toFixed(0)} m` : '–';
    evaluateCompliance();
  }

  function onPosErr(err) {
    console.warn('Geolocation error', err);
    $status().textContent = 'Location permission denied or unavailable. You can still pan/zoom the map and draw coastline.';
    if (map && map.getZoom() < 3) {
      map.setCenter({ lat: 20, lng: 0 });
      map.setZoom(2);
    }
  }

  // --- Zone computation options ---

  function updateZoneFromDrawnCoastlines() {
    exclusionDataLayer.forEach(f => exclusionDataLayer.remove(f));
    exclusionGeoJSON = null;

    if (!drawnCoastlines.length) {
      evaluateCompliance();
      return;
    }

    const lines = drawnCoastlines.map(poly => {
      const path = poly.getPath().getArray().map(ll => [ll.lng(), ll.lat()]);
      return turf.lineString(path);
    });
    const ml = turf.featureCollection(lines);
    const merged = lines.length === 1 ? lines[0] : turf.combine(ml).features[0];

    const buffer = turf.buffer(merged, LTE_MIN_DISTANCE_KM, { units: 'kilometers' });

    exclusionGeoJSON = buffer;
    addGeoJSONToDataLayer(exclusionDataLayer, buffer);
    evaluateCompliance();
  }

  async function computeZoneForCurrentView() {
    try {
      exclusionDataLayer.forEach(f => exclusionDataLayer.remove(f));
      exclusionGeoJSON = null;

      if (!landDataset) {
        landDataset = await tryLoadLandDataset();
      }
      if (!landDataset) {
        $status().textContent = 'No land dataset available. Use “Load land GeoJSON…” or draw coastline manually.';
        return;
      }

      const b = map.getBounds();
      const sw = b.getSouthWest(), ne = b.getNorthEast();
      const bbox = [sw.lng(), sw.lat(), ne.lng(), ne.lat()];

      let clipped;
      if (bbox[0] > bbox[2]) {
        const left = [bbox[0], bbox[1], 180, bbox[3]];
        const right = [-180, bbox[1], bbox[2], bbox[3]];
        const c1 = turf.bboxClip(landDataset, left);
        const c2 = turf.bboxClip(landDataset, right);
        clipped = turf.featureCollection([...(c1.features||[]), ...(c2.features||[])]);
      } else {
        clipped = turf.bboxClip(landDataset, bbox);
      }

      const buffer = turf.buffer(clipped, LTE_MIN_DISTANCE_KM, { units: 'kilometers' });

      exclusionGeoJSON = buffer;
      addGeoJSONToDataLayer(exclusionDataLayer, buffer);
      evaluateCompliance();
      $status().textContent = '12 km zone computed for current view.';
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to compute zone for current view.');
    }
  }

  async function tryLoadLandDataset() {
    for (const url of LAND_URLS) {
      try {
        const r = await fetch(url, { cache: 'force-cache' });
        if (!r.ok) continue;
        const json = await r.json();
        if (json && json.type) {
          $status().textContent = `Loaded land dataset: ${url}`;
          return json;
        }
      } catch (_) { /* try next */ }
    }
    return null;
  }

  function addGeoJSONToDataLayer(dataLayer, geojson) {
    dataLayer.forEach(f => dataLayer.remove(f));
    dataLayer.addGeoJson(geojson);
  }

  function evaluateCompliance() {
    let user = userMarker ? userMarker.getPosition() : null;
    if (!user) return;

    let distToCoastKm = null;
    let allowed = null;

    if (exclusionGeoJSON) {
      const pt = turf.point([user.lng(), user.lat()]);
      const isInside = turf.booleanPointInPolygon(pt, exclusionGeoJSON);
      const boundary = turf.polygonToLine(exclusionGeoJSON);
      const nearest = turf.nearestPointOnLine(boundary, pt, { units: 'kilometers' });
      const distToBoundaryKm = nearest.properties.dist;

      if (isInside) {
        distToCoastKm = LTE_MIN_DISTANCE_KM - distToBoundaryKm;
        allowed = false;
      } else {
        distToCoastKm = LTE_MIN_DISTANCE_KM + distToBoundaryKm;
        allowed = true;
      }

      const marginKm = distToCoastKm - LTE_MIN_DISTANCE_KM;
      setStatus(allowed, distToCoastKm, marginKm);
      return;
    }

    if (drawnCoastlines.length) {
      const lines = drawnCoastlines.map(poly => {
        const path = poly.getPath().getArray().map(ll => [ll.lng(), ll.lat()]);
        return turf.lineString(path);
      });
      const ml = turf.featureCollection(lines);
      const merged = lines.length === 1 ? lines[0] : turf.combine(ml).features[0];

      const pt = turf.point([user.lng(), user.lat()]);
      const d = turf.pointToLineDistance(pt, merged, { units: 'kilometers' });
      distToCoastKm = d;
      const marginKm = distToCoastKm - LTE_MIN_DISTANCE_KM;
      const allowed = marginKm >= 0;
      setStatus(allowed, distToCoastKm, marginKm);
      return;
    }

    $status().textContent = 'No coastal data yet: click “Draw coastline”, “Compute 12 km zone”, or “Load land GeoJSON…”.';
    $shoreDist().textContent = '–';
    $margin().textContent = '–';
  }

  function setStatus(allowed, distToCoastKm, marginKm) {
    const s = $status();
    s.classList.remove('status-ok', 'status-bad');

    if (allowed) {
      s.textContent = '✅ Allowed: you are at least 12 km from the coastline.';
      s.classList.add('status-ok');
    } else {
      s.textContent = '⛔ Not allowed: you are within 12 km of the coastline.';
      s.classList.add('status-bad');
    }

    $shoreDist().textContent = `${distToCoastKm.toFixed(2)} km`;
    $margin().textContent = `${marginKm >= 0 ? '+' : ''}${marginKm.toFixed(2)} km`;
  }

  function clearAll() {
    drawnCoastlines.forEach(p => p.setMap(null));
    drawnCoastlines = [];
    exclusionDataLayer.forEach(f => exclusionDataLayer.remove(f));
    exclusionGeoJSON = null;
    evaluateCompliance();
  }
})();
