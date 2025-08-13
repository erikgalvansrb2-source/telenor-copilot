
let map, userMarker, lteCircle;

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 6,
        center: { lat: 60.472, lng: 8.4689 }, // Center on Norway
    });

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            position => {
                const userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };

                if (userMarker) {
                    userMarker.setPosition(userLocation);
                } else {
                    userMarker = new google.maps.Marker({
                        position: userLocation,
                        map: map,
                        title: "Your Location",
                        icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                    });
                }

                map.setCenter(userLocation);

                // Simulate coast 10km inland from user
                const coastLocation = google.maps.geometry.spherical.computeOffset(userLocation, 10000, 180);

                if (lteCircle) {
                    lteCircle.setMap(null);
                }

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

                const distance = google.maps.geometry.spherical.computeDistanceBetween(
                    new google.maps.LatLng(userLocation),
                    new google.maps.LatLng(coastLocation)
                );

                const statusText = distance >= 12000
                    ? "✅ You are in the LTE reception zone"
                    : "❌ You are outside the LTE reception zone";

                document.getElementById("status").innerText = statusText + " (Distance: " + Math.round(distance) + " meters)";
            },
            error => {
                document.getElementById("status").innerText = "Geolocation error: " + error.message;
            },
            { enableHighAccuracy: true }
        );
    } else {
        document.getElementById("status").innerText = "Geolocation is not supported by this browser.";
    }
}
