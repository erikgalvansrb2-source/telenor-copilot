/* Telenor Maritime – LTE 12 km compliance map */
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
  let landClipGeoJSON = null;          // turf geojson clipped to view (optional)
  let exclusionGeoJSON = null;         // turf geojson buffer (12km)

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
    // Load drawing + geometry libraries
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
        // remove individual polyline on right-click
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

    // Try to get location immediately
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
    // Keep a sensible default center if no geolocation
    if (map && map.getZoom() < 3) {
      map.setCenter({ lat: 20, lng: 0 });
      map.setZoom(2);
    }
  }

  // --- Zone computation options ---

  // A) From a user‑drawn coastline polyline (simple & local)
  function updateZoneFromDrawnCoastlines() {
    exclusionDataLayer.forEach(f => exclusionDataLayer.remove(f));
    exclusionGeoJSON = null;

    if (!drawnCoastlines.length) {
      evaluateCompliance();
      return;
    }

    // Convert polylines to a single LineString/MultiLineString in GeoJSON
    const lines = drawnCoastlines.map(poly => {
      const path = poly.getPath().getArray().map(ll => [ll.lng(), ll.lat()]);
      return turf.lineString(path);
    });
    const ml = turf.featureCollection(lines);
    const merged = lines.length === 1 ? lines[0] : turf.combine(ml).features[0];

    // Buffer outward by 12 km to create the coastal exclusion zone
    const buffer = turf.buffer(merged, LTE_MIN_DISTANCE_KM, { units: 'kilometers' });

    exclusionGeoJSON = buffer;
    addGeoJSONToDataLayer(exclusionDataLayer, buffer);
    evaluateCompliance();
  }

  // B) From global land polygons (optional file) clipped to current view (accurate & scalable)
  async function computeZoneForCurrentView() {
    try {
      exclusionDataLayer.forEach(f => exclusionDataLayer.remove(f));
      exclusionGeoJSON = null;

      // Load land GeoJSON if not already present
      const land = await fetch('data/ne_110m_land.geojson').then(r => {
        if (!r.ok) throw new Error('Land dataset not found. Place "data/ne_110m_land.geojson" next to the files.');
        return r.json();
      });

      // Clip to current map bounds to keep it fast
      const b = map.getBounds();
      const sw = b.getSouthWest(), ne = b.getNorthEast();
      const bbox = [sw.lng(), sw.lat(), ne.lng(), ne.lat()];
      const clipped = turf.bboxClip(land, bbox);

      // Buffer by 12 km to create coastal exclusion zone
      const buffer = turf.buffer(clipped, LTE_MIN_DISTANCE_KM, { units: 'kilometers' });

      landClipGeoJSON = clipped;
      exclusionGeoJSON = buffer;
      addGeoJSONToDataLayer(exclusionDataLayer, buffer);
      evaluateCompliance();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to compute zone for current view.');
    }
  }

  // --- Helpers ---
  function addGeoJSONToDataLayer(dataLayer, geojson) {
    // Remove old features
    dataLayer.forEach(f => dataLayer.remove(f));

    // Google Maps Data layer expects GeoJSON in RFC 7946 format
    dataLayer.addGeoJson(geojson);
  }

  // Evaluate if the user is inside or outside the exclusion zone, and compute distances/margins
  function evaluateCompliance() {
    let user = userMarker ? userMarker.getPosition() : null;
    if (!user) return;

    let distToCoastKm = null;
    let allowed = null;

    // Prefer exclusionGeoJSON (buffer from land or drawn line)
    if (exclusionGeoJSON) {
      const pt = turf.point([user.lng(), user.lat()]);
      const isInside = turf.booleanPointInPolygon(pt, exclusionGeoJSON);

      // Distance to the exclusion boundary (which is 12 km from coast):
      //  - if outside: marginBeyond = distance to boundary (positive)
      //  - if inside:  marginShort  = -distance to boundary (negative)
      const boundary = turf.polygonToLine(exclusionGeoJSON);
      const nearest = turf.nearestPointOnLine(boundary, pt, { units: 'kilometers' });
      const distToBoundaryKm = nearest.properties.dist;

      // Convert boundary distance to *coastline* distance:
      //   distance to coast = distance to 12 km boundary + 12 km (outside)
      //   distance to coast = 12 km - distance to boundary (inside)
      if (isInside) {
        distToCoastKm = LTE_MIN_DISTANCE_KM - distToBoundaryKm;
        allowed = false;
      } else {
        distToCoastKm = LTE_MIN_DISTANCE_KM + distToBoundaryKm;
        allowed = true;
      }

      // Report margin vs 12 km (positive = good, negative = too close)
      const marginKm = distToCoastKm - LTE_MIN_DISTANCE_KM;
      setStatus(allowed, distToCoastKm, marginKm);
      return;
    }

    // If we have no exclusionGeoJSON but we do have drawn polylines,
    // compute distance to the drawn line(s) and compare to 12 km.
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

    // No coastline info yet
    $status().textContent = 'No coastal data yet: click “Draw coastline” or “Compute 12 km zone for current view”.';
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
    // Clear drawn polylines
    drawnCoastlines.forEach(p => p.setMap(null));
    drawnCoastlines = [];

    // Clear exclusion polygons
    exclusionDataLayer.forEach(f => exclusionDataLayer.remove(f));
    exclusionGeoJSON = null;
    landClipGeoJSON = null;

    evaluateCompliance();
  }
})();
