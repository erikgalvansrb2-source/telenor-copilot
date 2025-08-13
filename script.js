
function initMap() {
    if (!navigator.geolocation) {
        document.getElementById("status").textContent = "Geolocation is not supported by your browser.";
        return;
    }

    navigator.geolocation.getCurrentPosition(function(position) {
        const userLatLng = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);

        // Simulated coast location 12 km inland (south)
        const coastLatLng = google.maps.geometry.spherical.computeOffset(userLatLng, 12000, 180);

        const mapBounds = new google.maps.LatLngBounds();
        mapBounds.extend(userLatLng);
        mapBounds.extend(coastLatLng);

        const map = new google.maps.Map(document.getElementById("map"), {
            center: mapBounds.getCenter(),
            zoom: 10
        });
        map.fitBounds(mapBounds);

        // Add user marker
        new google.maps.Marker({
            position: userLatLng,
            map: map,
            title: "Your Location",
            icon: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png"
        });

        // Add coast marker
        new google.maps.Marker({
            position: coastLatLng,
            map: map,
            title: "Simulated Coast",
            icon: "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
        });

        // Draw LTE zone circle
        const lteCircle = new google.maps.Circle({
            strokeColor: "#0000FF",
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: "#0000FF",
            fillOpacity: 0.2,
            map: map,
            center: coastLatLng,
            radius: 12000
        });

        // Calculate distance and update status
        const distance = google.maps.geometry.spherical.computeDistanceBetween(userLatLng, coastLatLng);
        const statusText = distance >= 12000
            ? `✅ You are inside the LTE reception zone (Distance: ${Math.round(distance)} meters)`
            : `❌ You are outside the LTE reception zone (Distance: ${Math.round(distance)} meters)`;
        document.getElementById("status").textContent = statusText;
    }, function() {
        document.getElementById("status").textContent = "Unable to retrieve your location.";
    });
}
