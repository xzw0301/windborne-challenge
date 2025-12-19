/**
 * WINDBORNE SYSTEMS - CONSTELLATION DASHBOARD
 * -------------------------------------------
 * This script manages the fetching, processing, and analysis of 24-hour 
 * balloon telemetry and correlates it with global wind models.
 */

// --- GLOBAL CONFIGURATION ---
const API_BASE = "https://a.windbornesystems.com/treasure/";
const PROXY = "https://api.allorigins.win/raw?url=";
const HOURS = 24;
const THEORETICAL_MAX_POINTS = 24000; // 1000 balloons * 24 hours

// --- STATE MANAGEMENT ---
let constellation = {}; // Stores all tracks: { balloonID: [ {lat, lon, alt, hourIndex}, ... ] }
let matchScores = {};   // Stores analysis for each balloon: { balloonID: {score, wind, speed} }
let map, pathLayer;

/**
 * 1. HAVERSINE FORMULA
 * Calculates the distance between two points on a sphere.
 * @param {number} lat1, lon1 - Start coordinates
 * @param {number} lat2, lon2 - End coordinates
 * @returns {number} Distance in Kilometers
 */
function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * 0. MAP INITIALIZATION
 * Connects to Leaflet and sets the initial global view.
 */
function initMap() {
    // Check if map is already initialized to avoid errors on refresh
    if (map) return; 

    // Initialize the map and set view to a global center (lat, lon, zoom)
    map = L.map('map', { 
        zoomControl: false, 
        attributionControl: true 
    }).setView([20, 0], 3);

    // Add the "Voyager" tile layer (Clean, elegant white style)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Create an empty layer to hold the balloon path lines
    pathLayer = L.layerGroup().addTo(map);
}

/**
 * 2. DATA ACQUISITION
 * Fetches 24 JSON files in parallel, parses points, and handles errors.
 */
async function fetchData() {
    const urls = Array.from({ length: HOURS }, (_, i) => 
        `${PROXY}${encodeURIComponent(API_BASE + i.toString().padStart(2, "0") + ".json")}`
    );

    const responses = await Promise.all(urls.map(url => 
        fetch(url).then(r => r.json()).catch(() => null)
    ));

    let corruptFiles = 0;
    let validPointsCount = 0;

    responses.forEach((data, hourIndex) => {
        // If the whole file fails to load or isn't an array, it's "Corrupt"
        if (!data || !Array.isArray(data)) {
            corruptFiles++;
            return;
        }

        data.forEach((pt, balloonIdx) => {
            let lat, lon, alt;
            // Handle both Array [lat, lon, alt] and Object {lat, lon, alt} formats
            if (Array.isArray(pt)) [lat, lon, alt] = pt;
            else if (pt) { lat = pt.lat; lon = pt.lon; alt = pt.alt; }

            // Filter out mathematically invalid coordinates
            if (typeof lat === 'number' && !isNaN(lat) && Math.abs(lat) <= 90) {
                validPointsCount++;
                if (!constellation[balloonIdx]) constellation[balloonIdx] = [];
                constellation[balloonIdx].push({ lat, lon, alt, hourIndex });
            }
        });
    });

    // Update UI Stats
    document.getElementById('corrupt-count').innerText = `${corruptFiles} Files`;
    const validPct = Math.min(100, Math.round((validPointsCount / THEORETICAL_MAX_POINTS) * 100));
    document.getElementById('points-display').innerText = `${validPct}% (${validPointsCount.toLocaleString()} pts)`;

    // Proceed to analyze the fleet once data is loaded
    analyzeFleet();
}

/**
 * 3. FLEET ANALYSIS (THE ENGINE)
 * Iterates through the first 15 balloons and calculates their wind correlation.
 */
async function analyzeFleet() {
    const matchRateEl = document.getElementById('match-rate');
    matchRateEl.innerText = "Analyzing...";

    const fleetEntries = Object.entries(constellation)
        .filter(([_, track]) => track.some(p => p.hourIndex <= 3)) // Must be active recently
        .slice(0, 15);

    const analysisPromises = fleetEntries.map(async ([id, track]) => {
        track.sort((a, b) => a.hourIndex - b.hourIndex);
        const latest = track[0];
        const prev = track[1];
        if (!prev) return null;

        // A. Calculate Balloon Velocity
        const dist = getHaversineDistance(latest.lat, latest.lon, prev.lat, prev.lon);
        const hours = Math.max(0.1, prev.hourIndex - latest.hourIndex);
        const balloonSpeed = dist / hours;

        // B. Fetch Wind at correct Altitude (hPa pressure levels)
        const wind = await getWind(latest.lat, latest.lon, latest.alt);
        if (!wind) return null;

        // C. Calculate Correlation Score (Linear Scale)
        const diff = Math.abs(balloonSpeed - wind.speed);
        const score = Math.max(0, Math.round(100 - (diff * 2)));

        // Store for UI display
        matchScores[id] = { score, windSpeed: wind.speed, balloonSpeed };
        return score;
    });

    await Promise.all(analysisPromises);

    // Calculate Global Fleet Average
    const validScores = Object.values(matchScores).map(m => m.score);
    const avg = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;
    matchRateEl.innerText = `${avg}%`;

    renderFleet(fleetEntries);
}

/**
 * 4. UI RENDERING
 * Builds the sidebar list and triggers the default selection.
 */
function renderFleet(fleetEntries) {
    const list = document.getElementById('balloon-list');
    list.innerHTML = '';
    
    fleetEntries.forEach(([idx, track], i) => {
        const latest = track[0];
        const marker = L.circleMarker([latest.lat, latest.lon], {
            radius: 6, fillColor: '#0ea5e9', color: '#fff', weight: 2, fillOpacity: 0.9
        }).addTo(map);

        const item = document.createElement('div');
        item.className = 'balloon-item';
        item.innerHTML = `<strong>Balloon #${idx}</strong><br><small>${latest.lat.toFixed(2)}, ${latest.lon.toFixed(2)}</small>`;
        
        const select = () => selectBalloon(idx, track, item);
        item.onclick = select;
        marker.on('click', select);
        list.appendChild(item);

        // Auto-select the first balloon (Balloon #0) on load
        if (i === 0) select();
    });
}

/**
 * 5. SELECTION HANDLER
 * Updates the right-side detail panel for a specific balloon.
 */
function selectBalloon(id, track, element) {
    // UI Cleanup
    document.querySelectorAll('.balloon-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('details-content').style.display = 'block';
    
    const latest = track[0];
    const data = matchScores[id] || { score: 0, windSpeed: 0, balloonSpeed: 0 };

    // Update Text Data
    document.getElementById('selected-id').innerText = `Balloon #${id}`;
    document.getElementById('det-pos').innerText = `${latest.lat.toFixed(3)}, ${latest.lon.toFixed(3)}`;
    document.getElementById('det-alt').innerText = latest.alt ? `${latest.alt.toFixed(1)} km` : 'N/A';
    document.getElementById('v-ball').innerText = `${data.balloonSpeed.toFixed(1)} km/h`;
    document.getElementById('v-wind').innerText = `${data.windSpeed.toFixed(1)} km/h`;

    // Update Quality Badge with Color Coding
    const badge = document.getElementById('match-badge');
    badge.innerText = `QUALITY: ${data.score}% MATCH`;
    badge.style.color = data.score >= 80 ? "#16a34a" : (data.score >= 50 ? "#ca8a04" : "#dc2626");

    // Map Interaction
    pathLayer.clearLayers();
    L.polyline(track.map(p => [p.lat, p.lon]), { color: '#0ea5e9', weight: 3, opacity: 0.7 }).addTo(pathLayer);
    map.flyTo([latest.lat, latest.lon], 5);
}

/**
 * 6. EXTERNAL WEATHER API
 * Fetches wind speed at atmospheric pressure levels based on balloon height.
 */
async function getWind(lat, lon, alt) {
    const altMeters = alt < 100 ? alt * 1000 : alt; // Normalize KM to Meters
    let level = "10m"; // Default surface
    if (altMeters > 11000) level = "200hPa";
    else if (altMeters > 5000) level = "500hPa";

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_${level}&windspeed_unit=kmh&forecast_days=1`;
        const res = await fetch(url);
        const d = await res.json();
        return { speed: d.hourly[`wind_speed_${level}`][0] };
    } catch(e) { return null; }
}

// --- START APP ---
function start() {
    initMap();
    fetchData();
}
start();