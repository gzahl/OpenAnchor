# OpenAnchor Planned Features & Roadmap ⚓🚀

This document outlines the planned future features and enhancements for the **OpenAnchor** application. We prioritize reliability, PWA performance, and F-Droid FOSS compliance.

---

## 📅 Upcoming Features

### 1. Historical Anchor Track Archive 📂
*   **Goal**: Save and review past anchoring sessions.
*   **Details**:
    *   Store historical anchor coordinates, set radii, time of dropping/lifting, and complete vessel tracking paths locally via IndexedDB.
    *   Add an **Archive Dashboard** where users can view past sessions on the map.
    *   Expose export capabilities in standard **GPX** and **KML** formats for logging or importing into marine plotters (e.g. OpenCPN).

### 2. High-Performance Background Geofencing (Native Service) 🔋
*   **Goal**: Ensure zero tracking drop-outs on Android/iOS when the app is in the background or the screen is off.
*   **Details**:
    *   Implement Capacitor native foreground services for Android and background location updates for iOS.
    *   Rely on low-power geofencing APIs, only waking the full alarm engine when boundary thresholds are approached.
    *   Include persistent status bar notifications on Android.

### 3. Multi-Device Real-Time Telemetry Syncing 📲🔄📲
*   **Goal**: Monitor your vessel's status from a second device (e.g., from a tablet in the cabin or a smartphone while dining ashore).
*   **Details**:
    *   Create a secure, end-to-end encrypted (E2EE) peer-to-peer telemetry relay (using WebRTC or lightweight encrypted WebSocket relays).
    *   Stream live distance to anchor, SOG, COG, and alarm state to the shore device.
    *   Trigger notifications or SMS alerts on the remote device if the alarm is breached on the primary vessel.

### 4. Tides, Wind & Weather Anchor Drift Forecasting 💨🌊
*   **Goal**: Predict the boat's swing direction and warn of shifts in wind or tide.
*   **Details**:
    *   Integrate open maritime weather APIs (like Open-Meteo) to fetch local wind speed/direction and tidal currents.
    *   Overlay the active forecast on the navigation map.
    *   Calculate potential "danger zones" where the vessel might swing if wind shifts, aiding in proactive anchor setting.

### 5. Custom Map Tile Sources & Offline Chart Packs 🗺️📦
*   **Goal**: Fully offline sea charts without relying on cellular connection.
*   **Details**:
    *   Allow importing custom tile sources via URL templates.
    *   Build a **Tile Downloader** to download specific map areas (e.g. current bay/anchorage spot) directly into offline cache before leaving harbour.
    *   Support loading raster sea charts from local `.mbtiles` packages.

---

## 💬 Feature Requests & Contributions
OpenAnchor is a fully open-source marine safety tool. Feel free to open a GitHub Issue or submit a Pull Request to contribute to this roadmap!
