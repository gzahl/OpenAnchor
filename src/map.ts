import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { gpsEngine, GPSEngine } from './gps';
import type { GPSPosition, AlarmState } from './gps';
export class OpenAnchorMap {
  private map: L.Map | null = null;
  private currentLayerName: 'seamap' | 'topo' | 'satellite' | 'dark' = 'seamap';
  
  // Map layers
  private osmLayer: L.TileLayer;
  private seamapOverlay: L.TileLayer;
  private topoLayer: L.TileLayer;
  private satelliteLayer: L.TileLayer;
  private darkLayer: L.TileLayer;
  
  // Overlays & Markers
  private anchorMarker: L.Marker | null = null;
  private boatMarker: L.Marker | null = null;
  private safetyCircle: L.Circle | null = null;
  private sectorPolygon: L.Polygon | null = null;
  private vesselTrackGroup: L.FeatureGroup | null = null;
  private scopeLine: L.Polyline | null = null;
  private scopeTooltipMarker: L.CircleMarker | null = null;
  private isDraggingAnchor = false;
  private themeColor = '#ff3366';

  // Overpass Anchorage Spots overlay
  private anchorageLayer: L.FeatureGroup | null = null;
  private anchorageVisible = false;
  private overpassDebounceTimer: number | null = null;
  private lastFetchedBbox: string | null = null;
  
  // Callbacks
  private onAnchorMovedCallback: ((lat: number, lng: number) => void) | null = null;

  constructor(containerId: string) {
    // 1. Initialize Tile Layers
    // OpenStreetMap
    this.osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap-Mitwirkende'
    });

    // OpenSeaMap Overlay (translucent maritime data)
    this.seamapOverlay = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenSeaMap'
    });

    // OpenTopoMap (highly detailed terrain contours and wind-shadow topography)
    this.topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Kartendaten: © OpenStreetMap-Mitwirkende, SRTM | Kartendarstellung: © OpenTopoMap (CC-BY-SA)'
    });

    // Esri World Imagery (Satellite)
    this.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Tiles © Esri — Source: Esri, USDA, USGS, and the GIS User Community'
    });

    // CartoDB Dark Matter (Ultra-sleek dark bridge night-mode map)
    this.darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      attribution: '© OpenStreetMap, © CARTO'
    });

    // 2. Spawn Map (default coordinates around Baltic Sea Kiel sailing region)
    this.map = L.map(containerId, {
      center: [54.3210, 10.1234],
      zoom: 15,
      layers: [this.osmLayer, this.seamapOverlay],
      zoomControl: false // Disable zoom control to keep UI clean (we can add custom or bottom-right placement)
    });

    // Put standard Leaflet zoom in bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // 3. Set up click-to-place anchor handler
    this.map.on('dblclick', (e: L.LeafletMouseEvent) => {
      this.handleMapInteraction(e.latlng.lat, e.latlng.lng);
    });

    // 4. Overpass fetch on map move (debounced)
    this.map.on('moveend', () => {
      if (!this.anchorageVisible) return;
      if (this.overpassDebounceTimer !== null) {
        window.clearTimeout(this.overpassDebounceTimer);
      }
      this.overpassDebounceTimer = window.setTimeout(() => {
        this.fetchAnchorages();
      }, 700);
    });
  }

  /**
   * Refreshes the Leaflet map size calculation, preventing rendering glitch in custom containers
   */
  public invalidateSize(): void {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  /**
   * Handle setting or moving anchor via map clicking
   */
  private handleMapInteraction(lat: number, lng: number): void {
    if (this.onAnchorMovedCallback) {
      this.onAnchorMovedCallback(lat, lng);
    }
  }

  /**
   * Sets callback when anchor marker is dragged or map is double clicked
   */
  public onAnchorMoved(callback: (lat: number, lng: number) => void): void {
    this.onAnchorMovedCallback = callback;
  }

  /**
   * Switches tile layers: 'seamap' (osm + seamap overlay), 'topo', 'satellite', or 'dark'
   */
  public setLayer(layerName: 'seamap' | 'topo' | 'satellite' | 'dark'): void {
    if (!this.map) return;

    // Remove active layers
    this.map.removeLayer(this.osmLayer);
    this.map.removeLayer(this.seamapOverlay);
    this.map.removeLayer(this.topoLayer);
    this.map.removeLayer(this.satelliteLayer);
    this.map.removeLayer(this.darkLayer);

    this.currentLayerName = layerName;

    if (layerName === 'seamap') {
      this.map.addLayer(this.osmLayer);
      this.map.addLayer(this.seamapOverlay);
    } else if (layerName === 'topo') {
      this.map.addLayer(this.topoLayer);
    } else if (layerName === 'satellite') {
      this.map.addLayer(this.satelliteLayer);
    } else if (layerName === 'dark') {
      this.map.addLayer(this.darkLayer);
    }
  }

  public getLayer(): 'seamap' | 'topo' | 'satellite' | 'dark' {
    return this.currentLayerName;
  }

  /**
   * Dynamically centers map on boat
   */
  public centerOn(lat: number, lng: number, zoomLevel?: number): void {
    if (this.map) {
      this.map.setView([lat, lng], zoomLevel || this.map.getZoom());
    }
  }

  /**
   * Redraws boat position on map with proper accuracy ring and heading rotation
   */
  public updateBoatMarker(pos: GPSPosition): void {
    if (!this.map) return;

    let heading = pos.heading !== null ? pos.heading : 0;
    
    // Bow always points toward the anchor (boat weathervanes on its chain)
    const anchor = gpsEngine.getAnchor();
    if (anchor) {
      heading = this.calculateBearing(pos, anchor);
    }
    
    // Create Custom Glowing Boat SVG DivIcon
    const boatIcon = L.divIcon({
      className: 'boat-div-icon',
      html: `
        <div class="boat-svg-marker" style="transform: rotate(${heading}deg); width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;">
            <!-- Boat Hull -->
            <path d="M50,15 C60,40 65,70 58,85 C55,90 45,90 42,85 C35,70 40,40 50,15 Z" fill="#05ffb0" stroke="#000" stroke-width="3"/>
            <!-- Pulsing Center Directional Dot -->
            <circle cx="50" cy="50" r="8" fill="#ffffff" stroke="#05ffb0" stroke-width="2"/>
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    if (this.boatMarker) {
      this.boatMarker.setLatLng([pos.lat, pos.lng]);
      this.boatMarker.setIcon(boatIcon);
    } else {
      this.boatMarker = L.marker([pos.lat, pos.lng], { icon: boatIcon, zIndexOffset: 100 }).addTo(this.map);
    }

    this.redrawScopeLine();
  }

  /**
   * Redraws or places the draggable anchor marker on map
   */
  /**
   * Redraws or places the draggable anchor marker on map. Supports circle or sector alarm shapes.
   */
  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  public setThemeColor(color: string): void {
    this.themeColor = color;
  }

  public updateAnchorMarker(
    lat: number, 
    lng: number, 
    radiusMeters: number, 
    state: AlarmState,
    useSector: boolean = false,
    sectorWidth: number = 360,
    sectorHeading: number = 0,
    isLocked: boolean = false
  ): void {
    if (!this.map) return;

    const strokeThemeColor = state === 'ALARM' ? '#ff3366' : this.themeColor;

    // Create Custom Glowing Anchor SVG DivIcon
    const anchorIcon = L.divIcon({
      className: 'anchor-div-icon',
      html: `
        <div class="anchor-svg-marker" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="${strokeThemeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;">
            <circle cx="12" cy="5" r="3"/>
            <line x1="12" y1="22" x2="12" y2="8"/>
            <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
          </svg>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const isDraggable = !isLocked;

    // 1. Redraw/Create Draggable Anchor Marker
    if (this.anchorMarker) {
      if (!this.isDraggingAnchor) {
        this.anchorMarker.setLatLng([lat, lng]);
        this.anchorMarker.setIcon(anchorIcon);
      }
      if (isDraggable) {
        this.anchorMarker.dragging?.enable();
      } else {
        this.anchorMarker.dragging?.disable();
      }
    } else {
      this.anchorMarker = L.marker([lat, lng], {
        icon: anchorIcon,
        draggable: isDraggable,
        zIndexOffset: 200
      }).addTo(this.map);

      // Event listener for anchor dragging (continuous real-time updates)
      this.anchorMarker.on('dragstart', () => {
        this.isDraggingAnchor = true;
      });

      this.anchorMarker.on('drag', (e) => {
        const marker = e.target;
        const newLatLng = marker.getLatLng();
        this.handleMapInteraction(newLatLng.lat, newLatLng.lng);
      });

      this.anchorMarker.on('dragend', (e) => {
        this.isDraggingAnchor = false;
        const marker = e.target;
        const newLatLng = marker.getLatLng();
        this.handleMapInteraction(newLatLng.lat, newLatLng.lng);
      });
    }

    // 2. Determine color styling based on AlarmState
    let strokeColor = strokeThemeColor;
    let fillColor = this.hexToRgba(strokeThemeColor, 0.08);

    // 3. Render circle watch or sector watch
    if (useSector && sectorWidth < 360) {
      // Clear circular watch overlay if present
      if (this.safetyCircle) {
        this.map.removeLayer(this.safetyCircle);
        this.safetyCircle = null;
      }

      // Generate sector polygon coordinates mathematically
      const coords: L.LatLngExpression[] = [];
      coords.push([lat, lng]); // start at center (anchor)

      const R_EARTH = 6378137;
      const startAngle = sectorHeading - sectorWidth / 2;
      const endAngle = sectorHeading + sectorWidth / 2;
      
      // Interpolate points along the arc in steps of 5 degrees
      const step = 5;
      for (let angle = startAngle; angle <= endAngle; angle += step) {
        const angleRad = (90 - angle) * Math.PI / 180; // transform compass bearing to standard math angle
        const deltaLat = (radiusMeters / R_EARTH) * Math.sin(angleRad) * (180 / Math.PI);
        const cosLat = Math.cos(lat * Math.PI / 180);
        const deltaLng = (radiusMeters / R_EARTH) * Math.cos(angleRad) * (180 / Math.PI) / (cosLat !== 0 ? cosLat : 1);
        
        coords.push([lat + deltaLat, lng + deltaLng]);
      }

      // Ensure last point is exactly at endAngle
      const angleRadEnd = (90 - endAngle) * Math.PI / 180;
      const deltaLatEnd = (radiusMeters / R_EARTH) * Math.sin(angleRadEnd) * (180 / Math.PI);
      const cosLatEnd = Math.cos(lat * Math.PI / 180);
      const deltaLngEnd = (radiusMeters / R_EARTH) * Math.cos(angleRadEnd) * (180 / Math.PI) / (cosLatEnd !== 0 ? cosLatEnd : 1);
      coords.push([lat + deltaLatEnd, lng + deltaLngEnd]);

      coords.push([lat, lng]); // return to center to close shape

      if (this.sectorPolygon) {
        this.sectorPolygon.setLatLngs(coords);
        this.sectorPolygon.setStyle({ color: strokeColor, fillColor: fillColor });
      } else {
        this.sectorPolygon = L.polygon(coords, {
          color: strokeColor,
          weight: 3,
          fillColor: fillColor,
          fillOpacity: 1,
          dashArray: '4, 4'
        }).addTo(this.map);
      }
    } else {
      // Clear sector watch overlay if present
      if (this.sectorPolygon) {
        this.map.removeLayer(this.sectorPolygon);
        this.sectorPolygon = null;
      }

      if (this.safetyCircle) {
        this.safetyCircle.setLatLng([lat, lng]);
        this.safetyCircle.setRadius(radiusMeters);
        this.safetyCircle.setStyle({ color: strokeColor, fillColor: fillColor });
      } else {
        this.safetyCircle = L.circle([lat, lng], {
          radius: radiusMeters,
          color: strokeColor,
          weight: 3,
          fillColor: fillColor,
          fillOpacity: 1,
          dashArray: '4, 4'
        }).addTo(this.map);
      }
    }

    this.redrawScopeLine();
  }

  /**
   * Remove the anchor marker and its perimeter from the map
   */
  public clearAnchor(): void {
    if (!this.map) return;
    
    if (this.anchorMarker) {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = null;
    }
    
    if (this.safetyCircle) {
      this.map.removeLayer(this.safetyCircle);
      this.safetyCircle = null;
    }

    if (this.sectorPolygon) {
      this.map.removeLayer(this.sectorPolygon);
      this.sectorPolygon = null;
    }

    if (this.scopeLine) {
      this.map.removeLayer(this.scopeLine);
      this.scopeLine = null;
    }

    if (this.scopeTooltipMarker) {
      this.map.removeLayer(this.scopeTooltipMarker);
      this.scopeTooltipMarker = null;
    }
  }

  /**
   * Draws a dashed connection line representing Scope (boat-to-anchor)
   */
  private redrawScopeLine(): void {
    if (!this.map || !this.anchorMarker || !this.boatMarker) {
      if (this.scopeLine) {
        this.map.removeLayer(this.scopeLine);
        this.scopeLine = null;
      }
      if (this.scopeTooltipMarker) {
        this.map.removeLayer(this.scopeTooltipMarker);
        this.scopeTooltipMarker = null;
      }
      return;
    }

    const anchorLatLng = this.anchorMarker.getLatLng();
    const boatLatLng = this.boatMarker.getLatLng();

    // 1. Draw Polyline
    if (this.scopeLine) {
      this.scopeLine.setLatLngs([anchorLatLng, boatLatLng]);
    } else {
      this.scopeLine = L.polyline([anchorLatLng, boatLatLng], {
        color: '#8c9bb4',
        weight: 2,
        dashArray: '5, 8',
        opacity: 0.7
      }).addTo(this.map);
    }

    // 2. Draw Floating Tooltip exactly at the Midpoint
    const midLat = (anchorLatLng.lat + boatLatLng.lat) / 2;
    const midLng = (anchorLatLng.lng + boatLatLng.lng) / 2;
    
    const unit = gpsEngine.getLengthUnit();
    const distance = anchorLatLng.distanceTo(boatLatLng);
    const convertedDistance = GPSEngine.convertMeters(distance, unit);
    const distanceText = `${convertedDistance.toFixed(1)} ${unit}`;

    if (this.scopeTooltipMarker) {
      this.scopeTooltipMarker.setLatLng([midLat, midLng]);
      this.scopeTooltipMarker.setTooltipContent(distanceText);
    } else {
      this.scopeTooltipMarker = L.circleMarker([midLat, midLng], {
        radius: 0.1,
        stroke: false,
        fill: false,
        interactive: false
      }).addTo(this.map);

      this.scopeTooltipMarker.bindTooltip(distanceText, {
        permanent: true,
        direction: 'center',
        className: 'scope-tooltip'
      }).openTooltip();
    }
  }

  public getBoatLatLng(): L.LatLng | null {
    return this.boatMarker ? this.boatMarker.getLatLng() : null;
  }

  /**
   * Draws a historical point cloud showing vessel's track, with age-based opacity
   */
  public drawVesselTrack(
    history: GPSPosition[], 
    displayLimitHours: number,
    pointSize: number = 4,
    minOpacity: number = 10
  ): void {
    if (!this.map) return;

    this.clearVesselTrack();

    const now = Date.now();
    const cutOffTime = now - displayLimitHours * 60 * 60 * 1000;
    
    // Filter history points within range
    const filteredPoints = history.filter(pt => pt.timestamp >= cutOffTime);

    if (filteredPoints.length === 0) return;

    this.vesselTrackGroup = L.featureGroup().addTo(this.map);

    filteredPoints.forEach(pt => {
      const ageMs = now - pt.timestamp;
      const maxAgeMs = displayLimitHours * 60 * 60 * 1000;
      const ratio = Math.max(0, Math.min(1, ageMs / maxAgeMs));
      
      const minOp = minOpacity / 100;
      const opacity = 1 - (1 - minOp) * ratio;

      // Format timestamp, heading, speed, accuracy
      const unit = gpsEngine.getLengthUnit();
      const dateStr = new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const speedKn = pt.speed !== null ? (pt.speed * 1.94384).toFixed(1) + ' kn' : '0.0 kn';
      const cog = pt.heading !== null ? Math.round(pt.heading) + '°' : '---°';
      const convertedAcc = GPSEngine.convertMeters(pt.accuracy, unit);
      const acc = '±' + convertedAcc.toFixed(1) + ' ' + unit;

      const tooltipContent = `
        <div style="font-family: var(--font-mono); font-size: 0.75rem; padding: 2px; line-height: 1.35;">
          <div style="font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.15); margin-bottom: 4px; padding-bottom: 2px; color: var(--neon-blue);">LOG: ${dateStr}</div>
          <div>Kurs: ${cog}</div>
          <div>Speed: ${speedKn}</div>
          <div>Genauigkeit: ${acc}</div>
        </div>
      `;

      const marker = L.circleMarker([pt.lat, pt.lng], {
        radius: pointSize,
        fillColor: this.themeColor,
        fillOpacity: opacity,
        stroke: true,
        color: this.hexToRgba(this.themeColor, 0.6),
        weight: 1,
        opacity: opacity * 0.5,
        interactive: true
      });

      marker.bindTooltip(tooltipContent, {
        className: 'track-point-tooltip',
        direction: 'top',
        offset: [0, -pointSize]
      });

      this.vesselTrackGroup?.addLayer(marker);
    });
  }

  public clearVesselTrack(): void {
    if (this.map && this.vesselTrackGroup) {
      this.map.removeLayer(this.vesselTrackGroup);
      this.vesselTrackGroup = null;
    }
  }

  /* =========================================================================
     Overpass API – OSM Anchorage Spots
     ========================================================================= */

  /**
   * Toggle visibility of the OSM anchorage overlay.
   * Returns the new state (true = visible).
   */
  public toggleAnchorageLayer(): boolean {
    this.anchorageVisible = !this.anchorageVisible;
    if (this.anchorageVisible) {
      this.fetchAnchorages();
    } else {
      this.clearAnchorageLayer();
    }
    return this.anchorageVisible;
  }

  public getAnchorageLayerVisible(): boolean {
    return this.anchorageVisible;
  }

  private clearAnchorageLayer(): void {
    if (this.map && this.anchorageLayer) {
      this.map.removeLayer(this.anchorageLayer);
      this.anchorageLayer = null;
    }
    this.lastFetchedBbox = null;
  }

  /**
   * Fetch anchorages from Overpass API for the current map bounding box.
   * Uses bbox-level caching so we don't re-fetch if the view hasn't moved much.
   */
  private async fetchAnchorages(): Promise<void> {
    if (!this.map) return;

    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();

    // Only fetch at zoom >= 8 to avoid enormous area queries
    if (zoom < 8) {
      this.clearAnchorageLayer();
      return;
    }

    // Round bbox coordinates to 2 decimal places as cache key
    const bboxKey = [
      bounds.getSouth().toFixed(2),
      bounds.getWest().toFixed(2),
      bounds.getNorth().toFixed(2),
      bounds.getEast().toFixed(2)
    ].join(',');

    if (bboxKey === this.lastFetchedBbox) return; // nothing new to fetch
    this.lastFetchedBbox = bboxKey;

    // Overpass query: nodes, ways, relations tagged as anchorage
    const south = bounds.getSouth().toFixed(5);
    const west  = bounds.getWest().toFixed(5);
    const north = bounds.getNorth().toFixed(5);
    const east  = bounds.getEast().toFixed(5);

    const query = `[out:json][timeout:20];
(
  nwr["seamark:type"="anchorage"](${south},${west},${north},${east});
  nwr["seamark:type"="anchorage_area"](${south},${west},${north},${east});
);
out center;`;

    const url = 'https://overpass-api.de/api/interpreter';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });

      if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
      const json = await response.json();

      this.renderAnchorageSpots(json.elements || []);
    } catch (err) {
      console.warn('OpenAnchor: Overpass API fetch failed:', err);
    }
  }

  /**
   * Render Overpass results as anchor icons on the map
   */
  private renderAnchorageSpots(elements: OverpassElement[]): void {
    if (!this.map) return;

    // Remove old layer
    if (this.anchorageLayer) {
      this.map.removeLayer(this.anchorageLayer);
    }
    this.anchorageLayer = L.featureGroup().addTo(this.map);

    elements.forEach(el => {
      // Use center for ways/relations, lat/lon for nodes
      const lat = el.type === 'node' ? el.lat : el.center?.lat;
      const lng = el.type === 'node' ? el.lon : el.center?.lon;
      if (lat === undefined || lng === undefined) return;

      const name = el.tags?.name || el.tags?.['seamark:anchorage:name'] || '';
      const category = el.tags?.['seamark:anchorage:category'] || '';
      const info = el.tags?.description || el.tags?.note || '';

      // Anchor icon: smaller, distinct from the user's own anchor
      const icon = L.divIcon({
        className: 'osm-anchorage-icon',
        html: `
          <div style="
            width: 28px; height: 28px;
            background: rgba(10,15,30,0.85);
            border: 1.5px solid rgba(0,210,255,0.6);
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 0 8px rgba(0,210,255,0.3);
          ">
            <svg viewBox="0 0 24 24" fill="none" stroke="#00d2ff" stroke-width="2.2"
                 stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;">
              <circle cx="12" cy="5" r="3"/>
              <line x1="12" y1="22" x2="12" y2="8"/>
              <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
            </svg>
          </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([lat, lng], { icon, zIndexOffset: 50 });

      // Build popup content
      const catLabel = category ? `<div style="color:var(--text-muted);font-size:0.7rem;margin-top:2px;">${category}</div>` : '';
      const infoLabel = info ? `<div style="color:var(--text-muted);font-size:0.68rem;margin-top:4px;line-height:1.3;">${info}</div>` : '';
      const popupHtml = `
        <div style="font-family:var(--font-sans);min-width:130px;">
          <div style="font-weight:700;color:var(--neon-blue);font-size:0.8rem;">
            &#9875; ${name || 'Ankerplatz'}
          </div>
          ${catLabel}
          ${infoLabel}
          <div style="font-size:0.62rem;color:var(--text-muted);margin-top:6px;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px;">
            OSM&nbsp;&middot;&nbsp;seamark:type=anchorage
          </div>
        </div>`;

      marker.bindPopup(popupHtml, {
        className: 'osm-anchorage-popup',
        maxWidth: 220
      });

      this.anchorageLayer?.addLayer(marker);
    });
  }

  /**
   * Calculates bearing from pos1 to pos2 (0-360 degrees)
   */
  private calculateBearing(pos1: { lat: number; lng: number }, pos2: { lat: number; lng: number }): number {
    const lat1 = pos1.lat * Math.PI / 180;
    const lat2 = pos2.lat * Math.PI / 180;
    const dLon = (pos2.lng - pos1.lng) * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
              
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  }
}

/** Minimal Overpass API element type */
interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}
