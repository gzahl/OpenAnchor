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

### 5. FOSS Crowdsourced Anchorage & Berth Directory 🗺️🔍
*   **Goal**: Discover safe anchorage locations, seabed ground types, and local marinas utilizing open-source data.
*   **Details**:
    *   Fetch public anchorage and marina data using OpenStreetMap (OSM) tags (such as `seamark:type=anchorage` or `mooring=anchor`).
    *   Overlay known anchorages on the map, displaying crucial information such as holding quality, shelter rating against wind directions, seabed composition (sand, mud, rocks), and average water depth.
    *   Implement a local database of user-submitted reviews and holding feedback, allowing crews to check in and share anchor safety observations offline.

### 6. Text-to-Speech (TTS) Intelligent Voice Alarms 🗣️🚨
*   **Goal**: Inform the captain of the exact drift distance and cardinal direction of drift immediately upon waking up, without needing to check the screen in the dark.
*   **Details**:
    *   Integrate the browser-native HTML5 Web Speech Synthesis API.
    *   When the alarm boundary is breached, synthesize clear spoken voice alerts:
        *   *English*: "Alarm! Drifting North-East by 35 meters! Speed is two point four knots."
        *   *German*: "Alarm! Abdrift nach Nord-Ost um 35 Meter! Geschwindigkeit beträgt zwei Komma vier Knoten."
    *   Provide custom volume, language selection, and speak interval options in settings.

### 7. Custom Map Tile Sources & Offline Chart Packs 🗺️📦
*   **Goal**: Fully offline sea charts without relying on cellular connection.
*   **Details**:
    *   Allow importing custom tile sources via URL templates.
    *   Build a **Tile Downloader** to download specific map areas (e.g. current bay/anchorage spot) directly into offline cache before leaving harbour.
    *   Support loading raster sea charts from local `.mbtiles` packages.

### 8. Open Boat Logbook & Float Plan Sharing ✍️📋
*   **Goal**: Keep a digital record of sea journeys and automatically notify contacts on land of safety check-ins.
*   **Details**:
    *   Implement an offline-first ship's logbook that automatically logs hourly coordinates, wind conditions, and barometric pressure during passages.
    *   Create a "Float Plan Creator" allowing users to declare their intended route, estimated time of arrival (ETA), and boat details, generating a lightweight shareable link to email or SMS to emergency contacts ashore.

---

## 💬 Feature Requests & Contributions
OpenAnchor is a fully open-source marine safety tool. Feel free to open a GitHub Issue or submit a Pull Request to contribute to this roadmap!
