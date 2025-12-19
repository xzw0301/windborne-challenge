# 🎈 Windborne Constellation Dashboard

An advanced telemetry visualization and validation platform designed to monitor the Windborne Systems balloon constellation. This dashboard correlates real-time flight data with global atmospheric models to calculate drift accuracy and data integrity.



## 🚀 Key Features

* **Fleet Health Monitoring:** Explicitly tracks "Corrupt" files at the source while maintaining a high recovery rate of 22,000+ individual telemetry points.
* **Atmospheric Correlation:** Matches balloon velocity against **Open-Meteo** global models at specific pressure levels (Surface, 500hPa, and 200hPa).
* **Global Fleet Average:** Pre-calculates a cumulative "Fleet Match Rate" upon initialization for a statistical overview of constellation performance.
* **Linear Quality Scoring:** Implements a nuanced 0–100% scoring algorithm based on precise velocity differentials rather than simple "pass/fail" buckets.

---

## 🔬 The Science: Algorithms & Logic

### 1. Spherical Distance (Haversine Formula)
Standard Euclidean geometry is inaccurate for long-distance flight tracking. This project uses the **Haversine Formula** to determine the "Great Circle" distance between coordinates on a sphere.



### 2. Vertical Wind Profiling (hPa Matching)
To ensure scientific accuracy, the dashboard maps the balloon's altitude to the corresponding atmospheric pressure level:
* **Stratospheric (> 11km):** Correlates with **200hPa** (Jet Stream).
* **Tropospheric (5km - 11km):** Correlates with **500hPa**.
* **Surface (< 5km):** Correlates with **10km** surface winds.



### 3. Linear Match Algorithm
The "Quality Match" is calculated using a linear scaling model:
**Score = 100 - (Speed Difference × 2)**
* **100%:** Perfect correlation (0 km/h difference).
* **80%:** High accuracy (10 km/h difference).
* **0%:** Outlier/Anomalous data (≥ 50 km/h difference).



---

## 🛠️ Technical Setup & Installation

### Prerequisites
* A modern web browser (Chrome, Firefox, Edge).
* An active internet connection for API requests.

### Libraries & APIs
* **Leaflet.js:** 2D Map rendering and path plotting.
* **Open-Meteo API:** High-resolution wind model data.
* **AllOrigins Proxy:** Utilized to bypass CORS restrictions for raw JSON telemetry.

### Installation
1.  **Clone the repository:** `git clone https://github.com/xzw0301/windborne-dashboard.git`
2.  **Run:** Open `index.html` in your browser. (Using VS Code "Live Server" is recommended).

---

## ⚠️ Troubleshooting

| Issue | Common Cause | Solution |
| :--- | :--- | :--- |
| **Map is grey/empty** | Leaflet CSS or Tile URL is blocked. | Check console for 403 errors; ensure `leaflet.css` is linked in `<head>`. |
| **0% Match Everywhere** | API Rate Limits or Connectivity. | Open-Meteo has a rate limit of 10,000 calls/day. Refresh in 1 minute. |
| **Corrupt Files Count High** | Proxy/CORS Server Downtime. | AllOrigins may be under heavy load. The dashboard will recover individual points regardless. |
| **Telemetry Not Loading** | Windborne Server Maintenance. | Check if `a.windbornesystems.com/treasure/` is accessible in your browser. |