# ⚓ OpenAnchor

[![Build](https://github.com/gzahl/OpenAnchor/actions/workflows/build-apk.yml/badge.svg)](https://github.com/gzahl/OpenAnchor/actions/workflows/build-apk.yml)
[![Version](https://img.shields.io/github/v/release/gzahl/OpenAnchor?logo=github)](https://github.com/gzahl/OpenAnchor/releases)
[![License](https://img.shields.io/github/license/gzahl/OpenAnchor)](LICENSE)

**Free & Open Source Anchor Alarm for Sailors**

OpenAnchor is a Progressive Web App (PWA) that monitors your vessel's GPS position while at anchor and triggers a visual/audio alarm if the boat drifts beyond a configurable radius. It runs entirely in the browser — no account, no cloud, no subscription.

![OpenAnchor Screenshot](./public/icons.svg)

---

## ✨ Features

| Feature | Details |
|---|---|
| **GPS Anchor Alarm** | Configurable 5–200 m (15–650 ft) alarm radius with step-buttons |
| **Sector Alarm** | Optional directional cone alarm — ideal for tidal swinging |
| **Vessel Track** | Records position history with heading, speed, GPS accuracy and timestamps |
| **OSM Anchorages** | Live overlay of anchorage spots from OpenStreetMap via Overpass API |
| **D-Pad Fine Tuning** | Nudge anchor position 1 m at a time in any cardinal direction |
| **Anchor Lock** | Locks the anchor position after setting (D-Pad only mode) |
| **Map Layers** | OpenSeaMap, Topo, Satellite, Dark — switch on the fly |
| **15 Languages** | DE, EN, ES, FR, PT, PL, IT, NL, HR, SV, DA, NO, FI, EL, TR |
| **Units** | Metric (m) and Imperial (ft) |
| **PWA / Offline** | Installable on phones and tablets; Service Worker for offline use |
| **Wake Lock** | Keeps the screen on while the alarm is armed |
| **Simulator Mode** | Test alarm logic without real GPS — drag the boat marker to simulate drift |

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- npm (comes with Node.js)

### Development

```bash
# 1. Clone the repo
git clone https://github.com/yourname/openanchor.git
cd openanchor

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The app is then available at **http://localhost:5173** (or the next free port).

> **Tip:** To test on a mobile device on the same Wi-Fi, run:
> ```bash
> npm run dev -- --host
> ```
> and open the `Network:` URL shown in the terminal on your phone.

### Production Build

```bash
npm run build
```

The optimised output lands in `dist/`. You can preview it with:

```bash
npm run preview
```

---

## 📱 Native Android App (Capacitor)

### Build APK locally

```bash
# 1. Build the web app
npm run build

# 2. Sync with Capacitor
npx cap sync android

# 3. Open in Android Studio (or build via CLI)
npx cap open android
```

In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK**.  
The APK lands in `android/app/build/outputs/apk/debug/`.

### F-Droid Repository (CI)

On every push to `main`, a GitHub Actions workflow automatically:

1. Builds the web app
2. Syncs Capacitor
3. Compiles a signed release APK
4. Generates an [F-Droid](https://f-droid.org/) repository
5. Deploys the repo to **GitHub Pages**

To install on your phone:

1. Add the F-Droid repo in your F-Droid client:
   ```
   https://<your-username>.github.io/OpenAnchor/fdroid/repo
   ```
2. Refresh and install **OpenAnchor**.

> The CI build uses an ephemeral debug key. For a production release, add your own keystore as [GitHub Actions secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).

---

## 📱 Using the App

### Setting an Anchor

1. Sail to your anchoring spot and tap **ANKER SETZEN** (or your language equivalent).  
   The app drops the anchor marker at your current GPS position.
2. Adjust the **Alarm-Radius** using the +/− buttons or the numeric input.
3. Fine-tune the anchor position if needed with the **D-Pad** (1 m steps).
4. Tap **SCHARF SCHALTEN** to arm the alarm.

### Alarm States

| Colour | Meaning |
|---|---|
| 🔵 Blue | Armed & safe — within radius |
| 🟠 Orange | Warning — approaching the boundary |
| 🔴 Red + strobe | Alarm — boat has drifted outside the radius |

Tap **STUMMSCHALTEN** on the strobe screen or the arm button again to disarm.

### OSM Anchorage Spots

Click the **anchor icon** (⚓) in the toolbar to overlay public anchorage spots from OpenStreetMap. Tap any marker for the name, category and notes from OSM.

- Data is fetched live from the [Overpass API](https://overpass-api.de/) for the current map view.
- Requires internet connection; works from zoom level 8 and above.

### Simulator Mode

Click the **▶ (play)** icon to enter simulator mode. A virtual boat is placed near the anchor. Click **DRIFT SIMULIEREN** to watch the boat slowly drift — the alarm will trigger when it exits the radius.

---

## 🗺️ Map Layers

| Button | Source |
|---|---|
| **SEAMAP** | OpenStreetMap + OpenSeaMap nautical overlay |
| **TOPO** | OpenTopoMap (terrain contours) |
| **SAT** | Esri World Imagery (satellite) |
| **DARK** | CartoDB Dark Matter |

---

## ⚙️ Settings

Open the settings panel via the ⚙ gear icon. The panel is organised into three swipeable tabs:

### Allgemein (General)
- **Language** — overrides the browser/system default
- **Units** — Meters or Feet
- **Anchor Lock** — prevent accidentally moving the anchor after setting it

### Design
- **Theme colour** — accent colour for the anchor icon, safety zones and track dots

### Track
- Log retention (1–24 hours)
- Track point size and minimum opacity
- Display window filter
- Log interval (5 s – 5 min)
- Clear track history

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Build | [Vite](https://vitejs.dev/) |
| Map | [Leaflet.js](https://leafletjs.com/) |
| Tile data | OpenStreetMap, OpenSeaMap, Esri, CartoDB |
| Anchorage data | [Overpass API](https://overpass-api.de/) (OpenStreetMap, ODbL) |
| PWA | Web App Manifest + Service Worker |
| Mobile packaging | [Capacitor](https://capacitorjs.com/) (optional) |
| Audio | Web Audio API (synthesised — no audio files needed) |
| GPS | Web Geolocation API |
| Offline | Cache-first Service Worker strategy |

---

## 📁 Project Structure

```
openanchor/
├── index.html          # App shell & all UI markup
├── public/
│   ├── manifest.json   # PWA manifest
│   ├── sw.js           # Service Worker
│   └── icons.svg       # App icons
└── src/
    ├── main.ts         # App bootstrap, event wiring
    ├── map.ts          # Leaflet map, overlays, Overpass API
    ├── gps.ts          # GPS engine, alarm logic, state management
    ├── i18n.ts         # 15-language translation system
    ├── audio.ts        # Synthesised alarm sounds (Web Audio API)
    ├── wakelock.ts     # Screen Wake Lock API wrapper
    └── style.css       # Full UI stylesheet (dark marine theme)
```

---

## 🌐 Data Sources & Licences

| Source | Licence |
|---|---|
| OpenStreetMap contributors | [ODbL](https://opendatacommons.org/licenses/odbl/) |
| OpenSeaMap contributors | [CC BY-SA](https://creativecommons.org/licenses/by-sa/3.0/) |
| Esri World Imagery | © Esri (see attribution in app) |
| CartoDB basemaps | © CARTO, © OpenStreetMap contributors |

---

## 🤝 Contributing

Pull requests are welcome! Please open an issue first to discuss what you'd like to change.

---

## 📄 Licence

MIT — see [LICENSE](./LICENSE) for details.
