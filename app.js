// --- CONFIGURATION ---
const API_BASE = "https://a.windbornesystems.com/treasure/";
const HOURS_HISTORY = 24; 

// --- STATE ---
const map = L.map('map').setView([20, 0], 2); 
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// --- UTILITIES ---
const safeParse = (text) => {
    try {
        const data = JSON.parse(text);
        if (!data) return null;
        return data;
    } catch (e) {
        // CHALLENGE REQUIREMENT: Handling documented corruption
        return null;
    }
};

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
}

function deg2rad(deg) { return deg * (Math.PI/180); }

// --- CORE LOGIC ---
async function init() {
    const statusText = document.getElementById('status-text');
    statusText.innerText = "Fetching Constellation...";
    
    const urls = Array.from({length: HOURS_HISTORY}, (_, i) => {
        const num = i.toString().padStart(2, '0');
        return `${API_BASE}${num}.json`;
    });

    const requests = urls.map(url => fetch(url).then(res => res.text()).catch(err => null));
    const rawResponses = await Promise.all(requests);

    const historyById = {}; 
    let corruptedCount = 0;

    rawResponses.forEach((text, hourIndex) => {
        if (!text) { corruptedCount++; return; }
        const data = safeParse(text);
        if (!data || !Array.isArray(data)) { corruptedCount++; return; }

        data.forEach(pt => {
            if (!pt.id || isNaN(pt.lat) || isNaN(pt.lon) || Math.abs(pt.lat) > 90) return;

            if (!historyById[pt.id]) historyById[pt.id] = [];
            historyById[pt.id].push({ ...pt, timeOffset: hourIndex });
        });
    });

    statusText.innerText = "Rendering & Analyzing...";
    let activeBalloons = 0;

    for (const [id, track] of Object.entries(historyById)) {
        track.sort((a, b) => a.timeOffset - b.timeOffset);
        if (track.length === 0) continue;

        const latest = track[0];
        if (latest.timeOffset > 2) continue; 

        activeBalloons++;

        const latlngs = track.map(t => [t.lat, t.lon]);
        L.polyline(latlngs, {color: '#3498db', weight: 2, opacity: 0.6}).addTo(map);

        const marker = L.circleMarker([latest.lat, latest.lon], {
            radius: 6, fillColor: "#e74c3c", color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.8
        }).addTo(map);

        let balloonSpeedKmh = "N/A";
        if (track.length > 1) {
            const prev = track[1]; 
            const distKm = getDistanceFromLatLonInKm(latest.lat, latest.lon, prev.lat, prev.lon);
            balloonSpeedKmh = distKm.toFixed(1);
            fetchWeatherComparison(latest.lat, latest.lon, balloonSpeedKmh, marker, id);
        }

        marker.bindPopup(`
            <div style="min-width: 150px">
                <strong>Balloon ID:</strong> ${id.substring(0,6)}...<br/>
                <strong>Alt:</strong> ${Math.round(latest.alt * 100) / 100} m<br/>
                <hr style="margin: 5px 0; border:0; border-top:1px solid #ccc;"/>
                <strong>Balloon Speed:</strong> ${balloonSpeedKmh} km/h<br/>
                <div id="weather-${id}">Checking Wind Model...</div>
            </div>
        `);
    }

    document.getElementById('status').style.display = 'none';
    document.getElementById('metrics').style.display = 'block';
    document.getElementById('balloon-count').innerText = activeBalloons;
    document.getElementById('corrupt-count').innerText = `${Math.round((corruptedCount / HOURS_HISTORY) * 100)}% Files Corrupt`;
}

async function fetchWeatherComparison(lat, lon, actualSpeed, marker, id) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&windspeed_unit=kmh`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.current_weather) {
            const windSpeed = data.current_weather.windspeed;
            const windDir = data.current_weather.winddirection;
            
            const diff = Math.abs(actualSpeed - windSpeed);
            const matchColor = diff < 15 ? "#27ae60" : (diff < 30 ? "#f39c12" : "#c0392b");
            const matchText = diff < 15 ? "Good Match" : "Deviation";

            const popupContent = `
                <div style="margin-top:5px; font-size: 0.9em; background: #f8f9fa; padding: 5px; border-radius: 4px;">
                    <strong>Model Wind:</strong> ${windSpeed} km/h <br/>
                    <strong>Direction:</strong> ${windDir}&deg; <br/>
                    <span style="background:${matchColor}; color:white; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${matchText}</span>
                </div>
            `;
            
            const popup = marker.getPopup();
            const currentContent = popup.getContent();
            const newContent = currentContent.replace(
                `<div id="weather-${id}">Checking Wind Model...</div>`, 
                popupContent
            );
            marker.setPopupContent(newContent);
        }
    } catch (e) {
        console.error("Weather fetch failed", e);
    }
}

init();