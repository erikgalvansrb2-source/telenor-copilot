
let map, userMarker, lteCircle;

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 3,
        center: { lat: 60.0, lng: 5.0 },
    });

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(showPosition, showError, {
            enableHighAccuracy: true,
            maximumAge: 0
        });
    } else {
        document.getElementById("status").innerText = "Geolocation is not supported by this browser.";
    }
}

function showPosition(position) {
    const userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };

    if (userMarker) userMarker.setMap(null);
    userMarker = new google.maps.Marker({
        position: userLocation,
        map: map,
        title: "Your Location"
    });

    map.setCenter(userLocation);

    // Simulate coastline detection: assume nearest coast is 10km inland from current location
    const coastLocation = simulateNearestCoast(userLocation);

    // Calculate distance to coast
    const distance = haversineDistance(userLocation, coastLocation);

    // Draw LTE zone circle (12km radius from coast)
    if (lteCircle) lteCircle.setMap(null);
    lteCircle = new google.maps.Circle({
        strokeColor: "#0000FF",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: "#0000FF",
        fillOpacity: 0.2,
        map,
        center: coastLocation,
        radius: 12000
    });

    const inZone = distance >= 12000;
    document.getElementById("status").innerText = inZone
        ? "✅ You are in the LTE reception zone."
        : "❌ You are outside the LTE reception zone.";
}

function showError(error) {
    document.getElementById("status").innerText = "Error getting location: " + error.message;
}

function simulateNearestCoast(location) {
    // Simulate a coast point 10km south of current location
    const deltaLat = -10 / 111; // Approx 1 degree latitude = 111km
    return {
        lat: location.lat + deltaLat,
        lng: location.lng
    };
}

function haversineDistance(coord1, coord2) {
    const R = 6371000; // Earth radius in meters
    const toRad = x => x * Math.PI / 180;

    const dLat = toRad(coord2.lat - coord1.lat);
    const dLon = toRad(coord2.lng - coord1.lng);

    const lat1 = toRad(coord1.lat);
    const lat2 = toRad(coord2.lat);

    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}
