/**
 * OpenAnchor GPS & Navigation Engine
 * Computes nautical metrics: Haversine distance, Bearing (COG), Speed (Knots), and GPS Accuracy.
 * Includes a full simulator mode for offline dashboard dry-runs.
 */

import { Capacitor } from '@capacitor/core';
import type { LanguageCode } from './i18n';
import { detectSystemLanguage } from './i18n';

export interface GPSPosition {
  lat: number;
  lng: number;
  accuracy: number; // meters
  speed: number | null; // m/s
  heading: number | null; // degrees (0-360)
  timestamp: number;
}

export type LengthUnit = 'm' | 'ft';
export type AlarmState = 'DISARMED' | 'SAFE' | 'WARNING' | 'ALARM';

export class GPSEngine {
  private watchId: number | null = null;
  private lastPosition: GPSPosition | null = null;
  private anchorPosition: { lat: number; lng: number } | null = null;
  private alarmRadius = 30; // default 30m
  private onPositionUpdateCallback: ((pos: GPSPosition) => void) | null = null;
  private onAlarmStateChangeCallback: ((state: AlarmState, distance: number) => void) | null = null;
  
  // Simulator State
  private isSimulationMode = false;
  private simPosition: GPSPosition = {
    lat: 54.3210,
    lng: 10.1234,
    accuracy: 3.2,
    speed: 0.2,
    heading: 240,
    timestamp: Date.now()
  };
  private simSwayStep = 0;
  private simDriftBearing: number | null = null; // Locked bearing for drift direction
  private simSwayCenterBearing: number | null = null; // Center bearing of the swing arc
  private simSwingCenterDistance: number | null = null; // Center distance of the swing arc

  private isArmed = false;
  private vesselHistory: GPSPosition[] = [];
  private simVesselHistory: GPSPosition[] = []; // Track points generated during simulation
  private historyLimitHours = 24; // Data log retention limit in hours
  private displayLimitHours = 24; // Map rendering filter in hours
  private trackPointSize = 4;
  private trackMinOpacity = 10;
  private trackIntervalSeconds = 60;
  private themeColor = '#ff3366';
  
  // Sector watch alarm config
  private useSectorAlarm = false;
  private sectorWidth = 90; // degrees cone width
  private sectorHeading = 0; // center direction compass bearing

  // Language & UI Preferences
  private language: LanguageCode = 'en';
  private lockAnchorAfterSet = true;
  private lengthUnit: LengthUnit = 'm';

  constructor() {
    // Load persisted configurations
    const savedRadius = localStorage.getItem('openanchor_radius');
    if (savedRadius) this.alarmRadius = parseInt(savedRadius, 10);

    const savedLang = localStorage.getItem('openanchor_language');
    if (savedLang) {
      this.language = savedLang as LanguageCode;
    } else {
      this.language = detectSystemLanguage();
    }

    const savedLock = localStorage.getItem('openanchor_lock_anchor');
    if (savedLock !== null) {
      this.lockAnchorAfterSet = savedLock === 'true';
    } else {
      this.lockAnchorAfterSet = true;
    }

    const savedUnit = localStorage.getItem('openanchor_length_unit');
    if (savedUnit) {
      this.lengthUnit = savedUnit as LengthUnit;
    }

    const savedHistoryLimit = localStorage.getItem('openanchor_history_limit');
    if (savedHistoryLimit) this.historyLimitHours = parseInt(savedHistoryLimit, 10);

    const savedDisplayLimit = localStorage.getItem('openanchor_display_limit');
    if (savedDisplayLimit) this.displayLimitHours = parseInt(savedDisplayLimit, 10);

    const savedPointSize = localStorage.getItem('openanchor_track_point_size');
    if (savedPointSize) this.trackPointSize = parseInt(savedPointSize, 10);

    const savedMinOpacity = localStorage.getItem('openanchor_track_min_opacity');
    if (savedMinOpacity) this.trackMinOpacity = parseInt(savedMinOpacity, 10);

    const savedInterval = localStorage.getItem('openanchor_track_interval_seconds');
    if (savedInterval) this.trackIntervalSeconds = parseInt(savedInterval, 10);

    const savedThemeColor = localStorage.getItem('openanchor_theme_color');
    if (savedThemeColor) this.themeColor = savedThemeColor;

    const savedUseSector = localStorage.getItem('openanchor_use_sector');
    if (savedUseSector) this.useSectorAlarm = savedUseSector === 'true';

    const savedSectorWidth = localStorage.getItem('openanchor_sector_width');
    if (savedSectorWidth) this.sectorWidth = parseInt(savedSectorWidth, 10);

    const savedSectorHeading = localStorage.getItem('openanchor_sector_heading');
    if (savedSectorHeading) this.sectorHeading = parseInt(savedSectorHeading, 10);

    // Load history log
    try {
      const savedHistory = localStorage.getItem('openanchor_vessel_history');
      if (savedHistory) {
        this.vesselHistory = JSON.parse(savedHistory);
        this.purgeOldHistoryPoints();
      }
    } catch (e) {
      console.error("Failed to load historical track: ", e);
      this.vesselHistory = [];
    }

    // Register Cordova/Capacitor App Resume listener to re-bind Geolocation permissions.
    // This recovers location tracking if it got blocked or stuck in an error state during
    // a permission request prompt overlay.
    try {
      document.addEventListener('resume', () => {
        if (!this.isSimulationMode) {
          console.log("OpenAnchor: App resumed. Re-binding Geolocation watch to activate newly granted permissions.");
          this.restartTracking();
        }
      });
    } catch (err) {
      console.warn("OpenAnchor: Failed to register native resume event listener:", err);
    }
  }

  /**
   * Toggle Simulator Mode
   */
  public setSimulationMode(active: boolean): void {
    this.isSimulationMode = active;
    this.simVesselHistory = []; // Always clear simulation history when entering or leaving simulation mode
    if (active) {
      this.stopTracking();
      // Initialize sim coordinates at last actual location if available, otherwise retain current simulated position
      if (this.lastPosition) {
        this.simPosition = {
          lat: this.lastPosition.lat,
          lng: this.lastPosition.lng,
          accuracy: 2.0,
          speed: 0.1,
          heading: this.lastPosition.heading || 0,
          timestamp: Date.now()
        };
      }
      this.triggerSimUpdate();
    } else {
      // Always resume live tracking when exiting simulation mode
      this.startTracking();
      // If we have a last actual GPS position, immediately trigger an update to snap the boat back to reality!
      if (this.lastPosition) {
        if (this.onPositionUpdateCallback) {
          this.onPositionUpdateCallback(this.lastPosition);
        }
        this.evaluateAlarmState();
      }
    }
    this.syncNativeService();
  }

  public getIsSimulationMode(): boolean {
    return this.isSimulationMode;
  }

  /**
   * Set the safe boundary radius in meters
   */
  public setAlarmRadius(radius: number): void {
    this.alarmRadius = Math.max(5, Math.min(200, radius));
    localStorage.setItem('openanchor_radius', this.alarmRadius.toString());
    this.evaluateAlarmState();
    this.syncNativeService();
  }

  public getAlarmRadius(): number {
    return this.alarmRadius;
  }

  /**
   * Set Anchor coordinates
   */
  public setAnchor(lat: number, lng: number): void {
    this.anchorPosition = { lat, lng };
    localStorage.setItem('openanchor_anchor_lat', lat.toString());
    localStorage.setItem('openanchor_anchor_lng', lng.toString());
    this.setArmed(true);
    this.evaluateAlarmState();
    this.syncNativeService();
  }

  /**
   * Shift anchor position by precise number of meters in cardinal directions (N, S, E, W)
   */
  public shiftAnchor(direction: 'N' | 'S' | 'E' | 'W', meters: number = 1): void {
    if (!this.anchorPosition) return;
    
    const R_EARTH = 6378137; // Earth's equatorial radius in meters
    const deltaLat = (meters / R_EARTH) * (180 / Math.PI); // ~8.993e-6 degrees for 1m
    
    let newLat = this.anchorPosition.lat;
    let newLng = this.anchorPosition.lng;

    switch (direction) {
      case 'N':
        newLat += deltaLat;
        break;
      case 'S':
        newLat -= deltaLat;
        break;
      case 'E': {
        const cosLat = Math.cos(newLat * Math.PI / 180);
        newLng += deltaLat / (cosLat !== 0 ? cosLat : 1);
        break;
      }
      case 'W': {
        const cosLat = Math.cos(newLat * Math.PI / 180);
        newLng -= deltaLat / (cosLat !== 0 ? cosLat : 1);
        break;
      }
    }

    this.setAnchor(newLat, newLng);
  }

  public getAnchor(): { lat: number; lng: number } | null {
    if (!this.anchorPosition) {
      const lat = localStorage.getItem('openanchor_anchor_lat');
      const lng = localStorage.getItem('openanchor_anchor_lng');
      if (lat && lng) {
        this.anchorPosition = { lat: parseFloat(lat), lng: parseFloat(lng) };
      }
    }
    return this.anchorPosition;
  }

  /**
   * Delete Anchor
   */
  public clearAnchor(): void {
    this.anchorPosition = null;
    localStorage.removeItem('openanchor_anchor_lat');
    localStorage.removeItem('openanchor_anchor_lng');
    this.setArmed(false);
    this.evaluateAlarmState();
    this.syncNativeService();
  }

  /**
   * Set Armed status
   */
  public setArmed(armed: boolean): void {
    this.isArmed = armed;
    if (armed) {
      if (!this.isSimulationMode) {
        this.startTracking();
      }
    } else {
      this.stopTracking();
      this.setAlarmState('DISARMED', 0);
    }
    this.syncNativeService();
  }

  public getIsArmed(): boolean {
    return this.isArmed;
  }

  /**
   * Registers callback for GPS changes
   */
  public onPositionUpdate(callback: (pos: GPSPosition) => void): void {
    this.onPositionUpdateCallback = callback;
  }

  /**
   * Registers callback for Alarm status changes
   */
  public onAlarmStateChange(callback: (state: AlarmState, distance: number) => void): void {
    this.onAlarmStateChangeCallback = callback;
  }

  /**
   * Start Geolocation tracking (standard browser/Capacitor engine)
   */
  public startTracking(): void {
    if (this.watchId !== null) return;

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    const success = (pos: GeolocationPosition) => {
      // Create position model
      const gpsPos: GPSPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed !== null ? pos.coords.speed : null,
        heading: pos.coords.heading !== null ? pos.coords.heading : null,
        timestamp: pos.timestamp
      };

      // Calculate speed and heading dynamically if GPS doesn't report them
      if (this.lastPosition && gpsPos.speed === null) {
        gpsPos.speed = this.calculateSpeed(this.lastPosition, gpsPos);
      }
      if (this.lastPosition && gpsPos.heading === null) {
        gpsPos.heading = this.calculateBearing(this.lastPosition, gpsPos);
      }

      // Filter GPS drift: Discard coordinate updates with abysmal accuracy (e.g. > 35m) when active
      if (gpsPos.accuracy > 35) {
        console.warn("Discarding coordinate update due to poor GPS lock: ±" + gpsPos.accuracy + "m");
        return;
      }

      this.lastPosition = gpsPos;
      this.addTrackPoint(gpsPos); // Log position in track history

      if (this.onPositionUpdateCallback) {
        this.onPositionUpdateCallback(gpsPos);
      }

      this.evaluateAlarmState();
    };

    const error = (err: GeolocationPositionError) => {
      console.error("GPS Watch Position Error: ", err);
    };

    if (navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(success, error, options);
    } else {
      console.error("Geolocation is not supported by this browser.");
    }
  }

  /**
   * Stop Geolocation tracking
   */
  public stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Fully restarts geolocation tracking
   */
  public restartTracking(): void {
    this.stopTracking();
    this.startTracking();
  }

  /**
   * Triggers a manual update from the Simulator
   */
  public updateSimPosition(lat: number, lng: number, heading?: number): void {
    if (!this.isSimulationMode) return;
    
    // Calculate simulated speed based on last sim point
    const now = Date.now();
    const dT = (now - this.simPosition.timestamp) / 1000; // seconds
    let speed = 0.1;
    let computedHeading = heading || this.simPosition.heading || 0;
    
    if (dT > 0) {
      const distance = this.calculateHaversine(this.simPosition.lat, this.simPosition.lng, lat, lng);
      speed = distance / dT; // m/s
      if (distance > 0.5) {
        computedHeading = this.calculateBearing(this.simPosition, { lat, lng });
      }
    }

    this.simPosition = {
      lat,
      lng,
      accuracy: 2.0, // High precision simulator lock
      speed: speed > 5 ? 5 : speed, // cap sim speed
      heading: computedHeading,
      timestamp: now
    };

    this.addTrackPoint(this.simPosition); // Log simulated point in history
    this.triggerSimUpdate();
  }

  private triggerSimUpdate(): void {
    if (this.onPositionUpdateCallback) {
      this.onPositionUpdateCallback(this.simPosition);
    }
    this.evaluateAlarmState();
  }

  /**
   * Simulates a realistic boat swaying/swinging back and forth at anchor in a 40° arc,
   * centered on either the sector alarm direction or South by default, with small jitter.
   * If driftActive is true, the boat slowly sways further and further outwards until it breaches the boundary.
   */
  public simulateSwayStep(driftActive: boolean): void {
    if (!this.isSimulationMode || !this.anchorPosition) return;

    this.simSwayStep++;

    const anchor = this.anchorPosition;
    const boat = this.simPosition;
    
    // Get current polar coordinates relative to anchor
    const currentDistance = this.calculateHaversine(anchor.lat, anchor.lng, boat.lat, boat.lng);
    const currentBearing = this.calculateBearing(anchor, boat);

    if (this.simDriftBearing === null) {
      this.simDriftBearing = currentBearing;
    }

    let nextDistance: number;
    let nextBearing: number;

    if (driftActive) {
      // Drifts outwards linearly away from the anchor
      nextDistance = currentDistance + 1.2 + (Math.random() - 0.5) * 0.4;
      nextBearing = (this.simDriftBearing + (Math.random() - 0.5) * 0.8 + 360) % 360;
      this.simDriftBearing = nextBearing;
    } else {
      // If drift is inactive, we slowly pull the boat back to the safe zone
      const targetSafeRadius = this.alarmRadius * 0.55;
      nextDistance = currentDistance + (targetSafeRadius - currentDistance) * 0.15 + (Math.random() - 0.5) * 0.4;
      
      const baseBearing = this.useSectorAlarm ? this.sectorHeading : 180;
      let diff = baseBearing - this.simDriftBearing;
      while (diff < -180) diff += 360;
      while (diff > 180) diff -= 360;
      this.simDriftBearing = (this.simDriftBearing + diff * 0.15 + 360) % 360;
      nextBearing = this.simDriftBearing;
    }

    // Project coordinates from anchor
    const R_EARTH = 6378137;
    const angleRad = (90 - nextBearing) * Math.PI / 180;
    const deltaLat = (nextDistance / R_EARTH) * Math.sin(angleRad) * (180 / Math.PI);
    const cosLat = Math.cos(anchor.lat * Math.PI / 180);
    const deltaLng = (nextDistance / R_EARTH) * Math.cos(angleRad) * (180 / Math.PI) / (cosLat !== 0 ? cosLat : 1);

    const newLat = anchor.lat + deltaLat;
    const newLng = anchor.lng + deltaLng;

    // Heading points away from anchor
    const heading = (nextBearing + 180) % 360;

    this.updateSimPosition(newLat, newLng, heading);
  }

  /**
   * Reset simulator to anchor position
   */
  public resetSimToAnchor(): void {
    if (!this.isSimulationMode || !this.anchorPosition) return;
    this.simSwayStep = 0;
    this.simDriftBearing = null;
    this.simSwingCenterDistance = null;
    this.updateSimPosition(this.anchorPosition.lat, this.anchorPosition.lng, 0);
  }

  /**
   * Initializes swing simulation at the boat's current position to prevent warping
   */
  public startSwingSimulation(): void {
    this.simDriftBearing = null;
    this.simSwayCenterBearing = null; // Forces recalculation from current position on first step
    this.simSwingCenterDistance = null; // Forces recalculation from current position on first step
  }

  /**
   * Initializes drift simulation at the boat's current position to prevent warping
   */
  public startDriftSimulation(): void {
    this.simDriftBearing = null;
  }

  /**
   * Simulate realistic anchored swinging:
   * The boat orbits the anchor.
   * Radius varies between ~35% and ~85% of alarm radius (natural chain scope variation).
   * The angular speed changes as radius changes (conservation of angular momentum feeling).
   * Heading always points away from anchor (as wind pushes the stern).
   */
  public simulateSwingAtAnchor(): void {
    if (!this.isSimulationMode || !this.anchorPosition) return;

    this.simSwayStep++;

    const anchor = this.anchorPosition;
    const boat = this.simPosition;
    
    // Get current polar coordinates relative to anchor
    const currentDistance = this.calculateHaversine(anchor.lat, anchor.lng, boat.lat, boat.lng);
    const currentBearing = this.calculateBearing(anchor, boat);

    // If center bearing is not set yet, capture current bearing as center of swing!
    if (this.simSwayCenterBearing === null) {
      this.simSwayCenterBearing = currentBearing;
    }

    // If center distance is not set yet, capture current distance as base of swing!
    if (this.simSwingCenterDistance === null) {
      this.simSwingCenterDistance = currentDistance;
    }

    // Target state: swing back and forth around our custom center bearing (not South/wind!)
    const swingAmplitude = 22.5; // degrees (max 22.5° deflection, total 45° swing range)
    const swingAngle = this.simSwayCenterBearing + Math.sin(this.simSwayStep * 0.12) * swingAmplitude;
    const desiredBearing = (swingAngle + 360) % 360;

    // Smoothly interpolate bearing to prevent jumping
    if (this.simDriftBearing === null) {
      this.simDriftBearing = currentBearing;
    }
    let diff = desiredBearing - this.simDriftBearing;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    this.simDriftBearing = (this.simDriftBearing + diff * 0.15 + 360) % 360;

    // Maintain anchor distance with very slight oscillation (max +/- 1.2m)
    const baseDistance = Math.max(5, this.simSwingCenterDistance);
    const desiredDistance = baseDistance + Math.sin(this.simSwayStep * 0.08) * 1.2;
    
    // Smoothly interpolate distance with minor jitter (+/- 0.3m) to limit total fluctuation to max +/- 2m
    const nextDistance = currentDistance + (desiredDistance - currentDistance) * 0.15 + (Math.random() - 0.5) * 0.6;

    // Project coordinates from anchor
    const R_EARTH = 6378137;
    const angleRad = (90 - this.simDriftBearing) * Math.PI / 180;
    const deltaLat = (nextDistance / R_EARTH) * Math.sin(angleRad) * (180 / Math.PI);
    const cosLat = Math.cos(anchor.lat * Math.PI / 180);
    const deltaLng = (nextDistance / R_EARTH) * Math.cos(angleRad) * (180 / Math.PI) / (cosLat !== 0 ? cosLat : 1);

    const newLat = anchor.lat + deltaLat;
    const newLng = anchor.lng + deltaLng;

    // Heading points away from anchor
    const heading = (this.simDriftBearing + 180) % 360;

    this.updateSimPosition(newLat, newLng, heading);
  }

  /**
   * Synchronizes the native Android Foreground Service with the current alarm parameters
   */
  private syncNativeService(): void {
    if (Capacitor.getPlatform() === 'android') {
      const anchor = this.getAnchor();
      const plugins = Capacitor.Plugins as any;
      if (plugins && plugins.BackgroundLocation) {
        if (this.isArmed && anchor && !this.isSimulationMode) {
          plugins.BackgroundLocation.startService({
            lat: anchor.lat,
            lng: anchor.lng,
            radius: this.alarmRadius,
            useSector: this.useSectorAlarm,
            sectorWidth: this.sectorWidth,
            sectorHeading: this.sectorHeading
          }).catch((err: any) => {
            console.error("Failed to start background location service:", err);
          });
        } else {
          plugins.BackgroundLocation.stopService().catch((err: any) => {
            console.error("Failed to stop background location service:", err);
          });
        }
      }
    }
  }

  /**
   * Evaluates if vessel is inside anchor range
   */
  private evaluateAlarmState(): void {
    const currentPos = this.isSimulationMode ? this.simPosition : this.lastPosition;
    
    if (!this.isArmed) {
      this.setAlarmState('DISARMED', 0);
      return;
    }

    if (!this.anchorPosition || !currentPos) {
      this.setAlarmState('SAFE', 0);
      return;
    }

    // 1. Compute direct boat-to-anchor distance
    const distance = this.calculateHaversine(
      currentPos.lat,
      currentPos.lng,
      this.anchorPosition.lat,
      this.anchorPosition.lng
    );

    // Initial state based on radius distance check
    let newState: AlarmState = 'SAFE';
    if (distance >= this.alarmRadius) {
      newState = 'ALARM';
    }

    // 2. Compute advanced circle sector boundary alarm check
    if (this.useSectorAlarm && distance > 2.5 && newState !== 'ALARM') {
      const bearingToVessel = this.calculateBearing(this.anchorPosition, currentPos);
      
      // Calculate angular distance between bearing and sectorHeading in [-180, 180] range
      const diff = ((bearingToVessel - this.sectorHeading + 180) % 360 + 360) % 360 - 180;
      
      if (Math.abs(diff) > this.sectorWidth / 2) {
        newState = 'ALARM';
      }
    }

    this.setAlarmState(newState, distance);
  }

  private setAlarmState(state: AlarmState, distance: number): void {
    if (this.onAlarmStateChangeCallback) {
      this.onAlarmStateChangeCallback(state, distance);
    }
  }

  /**
   * Haversine Formula: Computes geographical distance in meters between two lat/lng coordinates.
   */
  public calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
              
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // meters
  }

  /**
   * Bearing Formula: Computes compass angle (0-360) from point A to point B.
   */
  private calculateBearing(pos1: { lat: number, lng: number }, pos2: { lat: number, lng: number }): number {
    const lat1 = pos1.lat * Math.PI / 180;
    const lat2 = pos2.lat * Math.PI / 180;
    const dLon = (pos2.lng - pos1.lng) * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
              
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  }

  /**
   * Speed calculation based on delta time and delta distance (returns meters per second)
   */
  private calculateSpeed(pos1: GPSPosition, pos2: GPSPosition): number {
    const dist = this.calculateHaversine(pos1.lat, pos1.lng, pos2.lat, pos2.lng);
    const timeSec = (pos2.timestamp - pos1.timestamp) / 1000;
    if (timeSec <= 0) return 0;
    return dist / timeSec; // m/s
  }

  /**
   * Static helper to convert m/s to Knots (standard maritime speed unit)
   */
  public static mpsToKnots(speedMps: number | null): number {
    if (speedMps === null || speedMps < 0.05) return 0; // Filter out micro-vibrations
    return speedMps * 1.94384;
  }

  /* ==========================================================================
     Getters, Setters, and Private Track Methods
     ========================================================================== */

  public getVesselHistory(): GPSPosition[] {
    return this.isSimulationMode ? this.simVesselHistory : this.vesselHistory;
  }

  public getHistoryLimitHours(): number {
    return this.historyLimitHours;
  }

  public setHistoryLimitHours(hours: number): void {
    this.historyLimitHours = hours;
    localStorage.setItem('openanchor_history_limit', hours.toString());
    this.purgeOldHistoryPoints();
  }

  public getDisplayLimitHours(): number {
    return this.displayLimitHours;
  }

  public setDisplayLimitHours(hours: number): void {
    this.displayLimitHours = hours;
    localStorage.setItem('openanchor_display_limit', hours.toString());
  }

  public getUseSectorAlarm(): boolean {
    return this.useSectorAlarm;
  }

  public setUseSectorAlarm(active: boolean): void {
    this.useSectorAlarm = active;
    localStorage.setItem('openanchor_use_sector', active.toString());
    this.evaluateAlarmState();
    this.syncNativeService();
  }

  public getSectorWidth(): number {
    return this.sectorWidth;
  }

  public setSectorWidth(degrees: number): void {
    this.sectorWidth = degrees;
    localStorage.setItem('openanchor_sector_width', degrees.toString());
    this.evaluateAlarmState();
    this.syncNativeService();
  }

  public getSectorHeading(): number {
    return this.sectorHeading;
  }

  public setSectorHeading(degrees: number): void {
    this.sectorHeading = degrees;
    localStorage.setItem('openanchor_sector_heading', degrees.toString());
    this.evaluateAlarmState();
    this.syncNativeService();
  }

  private addTrackPoint(pos: GPSPosition): void {
    const now = Date.now();
    
    if (this.isSimulationMode) {
      if (this.simVesselHistory.length > 0) {
        const lastPoint = this.simVesselHistory[this.simVesselHistory.length - 1];
        const distance = this.calculateHaversine(lastPoint.lat, lastPoint.lng, pos.lat, pos.lng);
        const dT = (now - lastPoint.timestamp) / 1000;

        if (distance < 2.5 && dT < this.trackIntervalSeconds) {
          return; // Filter duplicate static log points in simulation
        }
      }
      this.simVesselHistory.push({ ...pos, timestamp: now });
      if (this.simVesselHistory.length > 500) {
        this.simVesselHistory.shift();
      }
      return;
    }
    
    // Only record if history is empty OR distance to last point > 2.5m OR dT > 60s
    if (this.vesselHistory.length > 0) {
      const lastPoint = this.vesselHistory[this.vesselHistory.length - 1];
      const distance = this.calculateHaversine(lastPoint.lat, lastPoint.lng, pos.lat, pos.lng);
      const dT = (now - lastPoint.timestamp) / 1000; // seconds

      if (distance < 2.5 && dT < this.trackIntervalSeconds) {
        return; // Filter duplicate static log points
      }
    }

    // Add new coordinate point
    this.vesselHistory.push({ ...pos, timestamp: now });
    
    // Purge old data points older than limit
    this.purgeOldHistoryPoints();

    // Persist
    try {
      localStorage.setItem('openanchor_vessel_history', JSON.stringify(this.vesselHistory));
    } catch (e) {
      console.warn("Storage quota limit reached for vessel tracks log!");
    }
  }

  private purgeOldHistoryPoints(): void {
    const now = Date.now();
    const cutOffTime = now - this.historyLimitHours * 60 * 60 * 1000;
    this.vesselHistory = this.vesselHistory.filter(point => point.timestamp >= cutOffTime);
  }
  
  public getTrackPointSize(): number {
    return this.trackPointSize;
  }
  public setTrackPointSize(size: number): void {
    this.trackPointSize = size;
    localStorage.setItem('openanchor_track_point_size', size.toString());
  }

  public getTrackMinOpacity(): number {
    return this.trackMinOpacity;
  }
  public setTrackMinOpacity(opacity: number): void {
    this.trackMinOpacity = opacity;
    localStorage.setItem('openanchor_track_min_opacity', opacity.toString());
  }

  public getTrackIntervalSeconds(): number {
    return this.trackIntervalSeconds;
  }
  public setTrackIntervalSeconds(secs: number): void {
    this.trackIntervalSeconds = secs;
    localStorage.setItem('openanchor_track_interval_seconds', secs.toString());
  }

  public getThemeColor(): string {
    return this.themeColor;
  }
  public setThemeColor(color: string): void {
    this.themeColor = color;
    localStorage.setItem('openanchor_theme_color', color);
  }

  public getLanguage(): LanguageCode {
    return this.language;
  }
  public setLanguage(lang: LanguageCode): void {
    this.language = lang;
    localStorage.setItem('openanchor_language', lang);
  }

  public getLockAnchorAfterSet(): boolean {
    return this.lockAnchorAfterSet;
  }
  public setLockAnchorAfterSet(lock: boolean): void {
    this.lockAnchorAfterSet = lock;
    localStorage.setItem('openanchor_lock_anchor', lock.toString());
  }

  public getLengthUnit(): LengthUnit {
    return this.lengthUnit;
  }
  public setLengthUnit(unit: LengthUnit): void {
    this.lengthUnit = unit;
    localStorage.setItem('openanchor_length_unit', unit);
  }

  public static convertMeters(meters: number, unit: LengthUnit): number {
    if (unit === 'ft') {
      return meters * 3.28084;
    }
    return meters;
  }

  public static convertToMeters(val: number, unit: LengthUnit): number {
    if (unit === 'ft') {
      return val / 3.28084;
    }
    return val;
  }

  public clearVesselHistory(): void {
    this.vesselHistory = [];
    localStorage.removeItem('openanchor_vessel_history');
  }
}

export const gpsEngine = new GPSEngine();
