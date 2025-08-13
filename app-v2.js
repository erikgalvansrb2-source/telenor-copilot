import * as turf from "https://cdn.jsdelivr.net/npm/@turf/turf@6/+esm";

const LTE_MIN_DISTANCE_KM = 12;
const $ = (id) => document.getElementById(id);
let map, drawingManager, exclusionDataLayer, exclusionGeoJSON=null;
let drawnCoastlines = []; let userMarker=null, accuracyCircle=null, watchId=null;

const NE110M_CDN = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_land.geojson';
const BASE = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/\/[^/]*$/, '/');
const LAND_URLS = [ BASE+'data/ne_110m_land.geojson', NE110M_CDN ];

(async function init(){
  console.log('[init] boot');
  $('kmValue').textContent = `${LTE_MIN_DISTANCE_KM} km`;

  const { Map } = await google.maps.importLibrary('maps');
  await google.maps.importLibrary('geometry');
  await google.maps.importLibrary('drawing');
  const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

  map = new Map($('map'), { center:{lat:0,lng:0}, zoom:2, mapTypeId:'hybrid', streetViewControl:false, mapId:'DEMO_MAP_ID' });

  exclusionDataLayer = new google.maps.Data({map});
  exclusionDataLayer.setStyle({fillColor:'#ff5c7a', fillOpacity:0.18, strokeColor:'#ff5c7a', strokeWeight:1.5});

  drawingManager = new google.maps.drawing.DrawingManager({drawingControl:false, polylineOptions:{strokeColor:'#00c7b7', strokeWeight:3}});
  drawingManager.setMap(map);
  google.maps.event.addListener(drawingManager, 'polylinecomplete', (poly)=>{ drawnCoastlines.push(poly); updateFromLines(); poly.addListener('rightclick', ()=>{ poly.setMap(null); drawnCoastlines = drawnCoastlines.filter(p=>p!==poly); updateFromLines(); }); });

  $('btnDrawCoast').onclick = ()=> drawingManager.setDrawingMode(drawingManager.getDrawingMode()? null : google.maps.drawing.OverlayType.POLYLINE);
  $('btnClear').onclick = clearAll; $('btnUseLocation').onclick = useMyLocation; $('btnComputeView').onclick = computeZoneForView;

  const fileInput = $('fileLand'); $('btnLoadLand').onclick = ()=> fileInput.click();
  fileInput.onchange = async ()=>{ const f=fileInput.files?.[0]; if(!f) return; try{ const json=JSON.parse(await f.text()); landDataset=json; $('statusText').textContent='Land dataset loaded from file.'; }catch(e){ alert('Invalid GeoJSON: '+e.message);} };

  useMyLocation();
  window.__map = map; window.__exclusion = ()=>exclusionGeoJSON; window.__land = ()=>landDataset;
})();

let landDataset=null;
async function ensureLand(){ if(landDataset) return landDataset; for(const url of LAND_URLS){ try{ console.log('[land] fetch', url); const r=await fetch(url,{cache:'force-cache'}); console.log('[land] status', r.status); if(!r.ok) continue; const j=await r.json(); if(j && j.type){ landDataset=j; $('statusText').textContent = `Loaded land dataset: ${url}`; return j; } } catch(e){ console.error('[land] failed', e); } } return null; }

function updateFromLines(){ try{ exclusionDataLayer.forEach(f=>exclusionDataLayer.remove(f)); exclusionGeoJSON=null; if(!drawnCoastlines.length){ evaluate(); return; } const lines = drawnCoastlines.map(poly=>{ const path=poly.getPath().getArray().map(ll=>[ll.lng(), ll.lat()]); return turf.lineString(path); }); const fc=turf.featureCollection(lines); const merged = lines.length===1? lines[0] : turf.combine(fc).features[0]; const buffer=turf.buffer(merged, LTE_MIN_DISTANCE_KM, {units:'kilometers'}); exclusionGeoJSON=buffer; exclusionDataLayer.addGeoJson(buffer); evaluate(); } catch(e){ console.error('[updateFromLines] error', e); $('statusText').textContent = 'Failed to render buffer from drawn lines.'; }}

async function computeZoneForView(){ try{ exclusionDataLayer.forEach(f=>exclusionDataLayer.remove(f)); exclusionGeoJSON=null; const land=await ensureLand(); if(!land){ $('statusText').textContent='No land dataset available.'; return; } const b=map.getBounds(); const sw=b.getSouthWest(), ne=b.getNorthEast(); const bbox=[sw.lng(), sw.lat(), ne.lng(), ne.lat()]; let clipped; if(bbox[0]>bbox[2]){ const left=[bbox[0],bbox[1],180,bbox[3]], right=[-180,bbox[1],bbox[2],bbox[3]]; const c1=turf.bboxClip(land,left), c2=turf.bboxClip(land,right); clipped=turf.featureCollection([...(c1.features||[]), ...(c2.features||[])]); } else { clipped=turf.bboxClip(land,bbox); }
  const buffer=turf.buffer(clipped, LTE_MIN_DISTANCE_KM, {units:'kilometers'}); exclusionGeoJSON=buffer; exclusionDataLayer.addGeoJson(buffer); evaluate(); $('statusText').textContent='12 km zone computed for current view.'; } catch(e){ console.error('[computeZoneForView] error', e); $('statusText').textContent = 'Failed to compute 12 km zone for current view.'; }}

function evaluate(){ const user = userMarker? userMarker.position: null; if(!user){ return; } if(exclusionGeoJSON){ const pt=turf.point([user.lng(), user.lat()]); const inside=turf.booleanPointInPolygon(pt, exclusionGeoJSON); const boundary=turf.polygonToLine(exclusionGeoJSON); const nearest=turf.nearestPointOnLine(boundary, pt, {units:'kilometers'}); const dB=nearest.properties.dist; const distToCoast = inside? LTE_MIN_DISTANCE_KM - dB : LTE_MIN_DISTANCE_KM + dB; const margin=distToCoast - LTE_MIN_DISTANCE_KM; setStatus(margin>=0, distToCoast, margin); return; }
  if(drawnCoastlines.length){ const lines = drawnCoastlines.map(poly=>{ const path=poly.getPath().getArray().map(ll=>[ll.lng(), ll.lat()]); return turf.lineString(path); }); const fc=turf.featureCollection(lines); const merged = lines.length===1? lines[0] : turf.combine(fc).features[0]; const pt=turf.point([user.lng(), user.lat()]); const d=turf.pointToLineDistance(pt, merged, {units:'kilometers'}); const margin=d - LTE_MIN_DISTANCE_KM; setStatus(margin>=0, d, margin); return; }
  $('statusText').textContent='No coastal data yet: draw, compute for view, or load a file.'; $('shoreDist').textContent='–'; $('margin').textContent='–'; }

function setStatus(ok, dist, margin){ const s=$('statusText'); s.classList.remove('status-ok','status-bad'); if(ok){ s.textContent='✅ Allowed: you are at least 12 km from the coastline.'; s.classList.add('status-ok'); } else { s.textContent='⛔ Not allowed: you are within 12 km of the coastline.'; s.classList.add('status-bad'); } $('shoreDist').textContent = `${dist.toFixed(2)} km`; $('margin').textContent = `${margin>=0?'+':''}${margin.toFixed(2)} km`; }

function clearAll(){ drawnCoastlines.forEach(p=>p.setMap(null)); drawnCoastlines=[]; exclusionDataLayer.forEach(f=>exclusionDataLayer.remove(f)); exclusionGeoJSON=null; evaluate(); }

function useMyLocation(){ if(!navigator.geolocation){ $('statusText').textContent='Geolocation not supported.'; return; } if(watchId) navigator.geolocation.clearWatch(watchId); watchId = navigator.geolocation.watchPosition(onPos, onErr, {enableHighAccuracy:true, maximumAge:5000, timeout:12000}); }

async function onPos(pos){ const {latitude:lat, longitude:lng, accuracy} = pos.coords; const p=new google.maps.LatLng(lat,lng);
  if(!userMarker){ const { AdvancedMarkerElement } = await google.maps.importLibrary('marker'); userMarker=new AdvancedMarkerElement({ map, position:p, title:'Your position' }); map.setCenter(p); map.setZoom(8);} else { userMarker.position = p; }
  if(!accuracyCircle){ accuracyCircle=new google.maps.Circle({map, center:p, radius:accuracy||50, strokeColor:'#49a0ff', strokeOpacity:.6, strokeWeight:1, fillColor:'#49a0ff', fillOpacity:.12}); } else { accuracyCircle.setCenter(p); accuracyCircle.setRadius(accuracy||50); }
  $('accuracy').textContent = accuracy? `${accuracy.toFixed(0)} m` : '–';
  evaluate();
}

function onErr(){ $('statusText').textContent = 'Location permission denied or unavailable.'; }
