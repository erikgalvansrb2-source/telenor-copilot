function checkReception() {
    // Simulated GPS coordinates
    const userLocation = { latitude: 60.3913, longitude: 5.3221 };

    // Simulated coastline coordinate
    const coastLocation = { latitude: 60.3910, longitude: 5.3200 };

    // Calculate distance using Haversine formula
    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth radius in meters
        const toRad = x => x * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    const distance = getDistance(
        userLocation.latitude, userLocation.longitude,
        coastLocation.latitude, coastLocation.longitude
    );

    const inReceptionZone = distance >= 12000;
    const status = document.getElementById("status");
    status.textContent = inReceptionZone
        ? `You are in the Telenor Maritime LTE reception zone (${(distance/1000).toFixed(2)} km from coast)`
        : `You are outside the LTE reception zone (${(distance/1000).toFixed(2)} km from coast)`;
}
