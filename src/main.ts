import './style.css';
import { gpsEngine, GPSEngine } from './gps';
import type { GPSPosition, AlarmState } from './gps';
import { audioSynth } from './audio';
import { OpenAnchorMap } from './map';
import { wakeLockManager } from './wakelock';
import { translateDOM, t } from './i18n';
import type { LanguageCode } from './i18n';
import { Capacitor } from '@capacitor/core';
import { syncManager } from './sync';
import type { SyncMode, SyncStatus } from './sync';

// Main application handles
let appMap: OpenAnchorMap;
let simMode: 'swing' | 'drift' | null = 'swing'; // active simulation mode
let simSwayIntervalId: number | null = null;
let firstLockAcquired = false;
let remoteHistory: GPSPosition[] = [];

// DOM Elements (Casted to any for 100% Ionic web components compatibility)
const elDistVal = document.getElementById('dist-val') as any;
const elScopeProgress = document.getElementById('scope-progress') as any;
const elSpeedVal = document.getElementById('speed-val') as any;
const elCogVal = document.getElementById('cog-val') as any;
const elAccuracyVal = document.getElementById('accuracy-val') as any;

const elSelectRadius = document.getElementById('select-radius') as any;

const elBtnAnchorSet = document.getElementById('btn-anchor-set') as any;

const elPadN = document.getElementById('pad-n') as any;
const elPadS = document.getElementById('pad-s') as any;
const elPadE = document.getElementById('pad-e') as any;
const elPadW = document.getElementById('pad-w') as any;
const elAnchorAdjusterPanel = document.querySelector('.anchor-adjuster-panel') as any;

const elStatusGps = document.getElementById('status-gps') as any;
const elStatusAlarm = document.getElementById('status-alarm') as any;

const elAlarmStrobe = document.getElementById('alarm-strobe') as any;
const elStrobeDistance = document.getElementById('strobe-distance') as any;
const elStrobeRadius = document.getElementById('strobe-radius') as any;
const elStrobeMuteBtn = document.getElementById('strobe-mute-btn') as any;

const elBtnSoundTest = document.getElementById('btn-sound-test') as any;
const elBtnSimMode = document.getElementById('btn-sim-mode') as any;
const elSimControlPanel = document.getElementById('sim-control-panel') as any;
const elBtnSimSwing = document.getElementById('btn-sim-swing') as any;
const elBtnSimDrift = document.getElementById('btn-sim-drift') as any;
const elBtnSimReset = document.getElementById('btn-sim-reset') as any;

const elMapLayerBtns = document.querySelectorAll('.map-layer-btn') as any;

const elBtnSettings = document.getElementById('btn-settings') as any;
const elBtnSettingsClose = document.getElementById('btn-settings-close') as any;

const elChkSectorEnable = document.getElementById('chk-sector-enable') as any;
const elSectorSettingsControls = document.getElementById('sector-settings-controls') as any;
const elSectorWidthSlider = document.getElementById('sector-width-slider') as any;
const elSectorWidthVal = document.getElementById('sector-width-val') as any;
const elSectorHeadingSlider = document.getElementById('sector-heading-slider') as any;
const elSectorHeadingVal = document.getElementById('sector-heading-val') as any;

const elHistoryLimitSlider = document.getElementById('history-limit-slider') as any;
const elHistoryLimitVal = document.getElementById('history-limit-val') as any;
const elSelectDisplayLimit = document.getElementById('select-display-limit') as any;
const elBtnClearTrack = document.getElementById('btn-clear-track') as any;

const elTrackPointSizeSlider = document.getElementById('track-point-size-slider') as any;
const elTrackPointSizeVal = document.getElementById('track-point-size-val') as any;
const elTrackMinOpacitySlider = document.getElementById('track-min-opacity-slider') as any;
const elTrackMinOpacityVal = document.getElementById('track-min-opacity-val') as any;

const elSelectThemeColor = document.getElementById('select-theme-color') as any;
const elSelectTrackInterval = document.getElementById('select-track-interval') as any;
const elBtnClearTrackQuick = document.getElementById('btn-clear-track-quick') as any;

const elSelectLanguage = document.getElementById('select-language') as any;
const elChkLockAnchor = document.getElementById('chk-lock-anchor') as any;
const elChkEnableSonar = document.getElementById('chk-enable-sonar') as any;
const elSelectLengthUnit = document.getElementById('select-length-unit') as any;
const elBtnAnchorageToggle = document.getElementById('btn-anchorage-toggle') as any;
const elBtnAnchorPause = document.getElementById('btn-anchor-pause') as any;

// Settings Tab Elements
const elTabBtns = document.querySelectorAll('.settings-tab') as any;
const elTabsTrack = document.querySelector('.settings-tabs-track') as HTMLDivElement;
const elTabsViewport = document.querySelector('.settings-tabs-viewport') as HTMLDivElement;

// Sync UI Elements
const elSyncModeSelector = document.getElementById('sync-mode-selector') as any;
const elSyncStatusVal = document.getElementById('sync-status-val') as HTMLSpanElement;
const elSyncPanelBoat = document.getElementById('sync-panel-boat') as HTMLDivElement;
const elSyncPanelShore = document.getElementById('sync-panel-shore') as HTMLDivElement;
const elSyncQrImage = document.getElementById('sync-qr-image') as HTMLImageElement;
const elSyncQrPlaceholder = document.getElementById('sync-qr-placeholder') as HTMLDivElement;
const elSyncTopicDisplay = document.getElementById('sync-topic-display') as HTMLSpanElement;
const elBtnSyncScan = document.getElementById('btn-sync-scan') as any;
const elSyncManualInput = document.getElementById('sync-manual-input') as HTMLInputElement;
const elBtnSyncManualConnect = document.getElementById('btn-sync-manual-connect') as any;
const elHeaderRemoteBadge = document.getElementById('header-remote-badge') as HTMLDivElement;

/* ==========================================================================
   1. Initialize Map & GPS Bindings
   ========================================================================== */

function initApp() {
  // Initialize Leaflet Map
  appMap = new OpenAnchorMap('map');

  // Load language settings & run initial DOM translation
  const savedLang = gpsEngine.getLanguage();
  if (elSelectLanguage) elSelectLanguage.value = savedLang;
  translateDOM(savedLang);

  // Ensure no anchor is set when the app starts
  gpsEngine.clearAnchor();

  // Bind map interactions to GPS Engine
  appMap.onAnchorMoved(async (lat, lng) => {
    // If anchor lock is enabled and we already have an anchor, block moving/resetting it via map clicks/drags
    if (gpsEngine.getLockAnchorAfterSet() && gpsEngine.getAnchor() !== null) {
      return;
    }

    // Drop anchor at coordinates
    gpsEngine.setAnchor(lat, lng);
    const r = gpsEngine.getAlarmRadius();
    appMap.updateAnchorMarker(
      lat, 
      lng, 
      r, 
      'SAFE', // Automatically Safe/Armed
      gpsEngine.getUseSectorAlarm(),
      gpsEngine.getSectorWidth(),
      gpsEngine.getSectorHeading(),
      gpsEngine.getLockAnchorAfterSet()
    );
    updateAnchorButtonUI();
    
    // Coupled Activation: Request Wake Lock
    await wakeLockManager.acquire();
    
    // Force boat heading to update toward the new anchor position
    const boatLatLng = appMap.getBoatLatLng();
    if (boatLatLng) {
      appMap.updateBoatMarker({
        lat: boatLatLng.lat,
        lng: boatLatLng.lng,
        accuracy: 0,
        speed: null,
        heading: null,
        timestamp: Date.now()
      });
    }
    
    // Play subtle audio click/chirp to confirm dropping anchor
    audioSynth.unlock();
  });

  // Bind GPS Engine events to UI updates
  gpsEngine.onPositionUpdate(handlePositionUpdate);
  gpsEngine.onAlarmStateChange(handleAlarmStateChange);

  // Setup UI event listeners
  setupEventListeners();

  // Synchronize dynamic DOM settings readouts to match engine's saved states
  populateRadiusSelectOptions(gpsEngine.getLengthUnit());

  // Load initial advanced settings fields
  if (elChkSectorEnable) elChkSectorEnable.checked = gpsEngine.getUseSectorAlarm();
  toggleSectorSettingsState(gpsEngine.getUseSectorAlarm());
  
  const sWidth = gpsEngine.getSectorWidth();
  if (elSectorWidthSlider) elSectorWidthSlider.value = sWidth.toString();
  if (elSectorWidthVal) elSectorWidthVal.innerText = sWidth.toString();

  const sHeading = gpsEngine.getSectorHeading();
  if (elSectorHeadingSlider) elSectorHeadingSlider.value = sHeading.toString();
  if (elSectorHeadingVal) elSectorHeadingVal.innerText = sHeading.toString();

  const hLimit = gpsEngine.getHistoryLimitHours();
  if (elHistoryLimitSlider) elHistoryLimitSlider.value = hLimit.toString();
  if (elHistoryLimitVal) elHistoryLimitVal.innerText = hLimit.toString();

  const dLimit = gpsEngine.getDisplayLimitHours();
  if (elSelectDisplayLimit) elSelectDisplayLimit.value = dLimit.toString();

  const pSize = gpsEngine.getTrackPointSize();
  if (elTrackPointSizeSlider) elTrackPointSizeSlider.value = pSize.toString();
  if (elTrackPointSizeVal) elTrackPointSizeVal.innerText = pSize.toString();

  const mOpacity = gpsEngine.getTrackMinOpacity();
  if (elTrackMinOpacitySlider) elTrackMinOpacitySlider.value = mOpacity.toString();
  if (elTrackMinOpacityVal) elTrackMinOpacityVal.innerText = mOpacity.toString();

  // Load anchor lock toggle
  if (elChkLockAnchor) elChkLockAnchor.checked = gpsEngine.getLockAnchorAfterSet();

  // Load sonar background sound toggle
  if (elChkEnableSonar) elChkEnableSonar.checked = gpsEngine.getEnableSonar();

  // Load and apply theme color
  const themeColor = gpsEngine.getThemeColor();
  if (elSelectThemeColor) elSelectThemeColor.value = themeColor;
  appMap.setThemeColor(themeColor);

  // Load and apply logging tracking interval
  const trackInterval = gpsEngine.getTrackIntervalSeconds();
  if (elSelectTrackInterval) elSelectTrackInterval.value = trackInterval.toString();

  // Try to acquire initial GPS lock
  gpsEngine.startTracking();

  // Setup E2EE Sync features
  setupSyncFeature();
}

/* ==========================================================================
   2. UI Update Callbacks
   ========================================================================== */

/**
 * Handle new incoming GPS position lock
 */
function handlePositionUpdate(pos: GPSPosition): void {
  // 1. Update Status Indicator
  elStatusGps.className = 'indicator gps-ready';
  elStatusGps.querySelector('.text')!.innerHTML = syncManager.getMode() === 'shore'
    ? t('tab_sync', gpsEngine.getLanguage()) + ' (Remote)'
    : t('gps_lock', gpsEngine.getLanguage());

  // 2. Center map on first lock
  if (!firstLockAcquired) {
    appMap.centerOn(pos.lat, pos.lng, 16);
    firstLockAcquired = true;
  }

  // 3. Update Vessel Marker on Map
  appMap.updateBoatMarker(pos);

  // 4. Update Digital Instruments
  // Speed (converted to knots)
  if (elSpeedVal) {
    const speedKnots = GPSEngine.mpsToKnots(pos.speed);
    elSpeedVal.innerHTML = `${speedKnots.toFixed(1)} <span class="unit-sub">kn</span>`;
  }

  // Heading (COG)
  if (elCogVal) {
    const headingStr = pos.heading !== null ? `${Math.round(pos.heading)}°` : '---°';
    elCogVal.innerText = headingStr;
  }

  // GPS Accuracy
  elAccuracyVal.innerHTML = `&plusmn;${pos.accuracy.toFixed(1)} <span class="unit-sub">m</span>`;
  if (pos.accuracy > 10) {
    elAccuracyVal.className = 'value text-warning';
  } else if (pos.accuracy > 20) {
    elAccuracyVal.className = 'value text-danger';
  } else {
    elAccuracyVal.className = 'value text-success';
  }

  // 5. Draw the historical tracking route
  const history = syncManager.getMode() === 'shore' ? remoteHistory : gpsEngine.getVesselHistory();
  appMap.drawVesselTrack(
    history, 
    gpsEngine.getDisplayLimitHours(),
    gpsEngine.getTrackPointSize(),
    gpsEngine.getTrackMinOpacity()
  );
}

/**
 * Handle state changes from GPS Engine (Safe -> Warning -> Alarm transitions)
 */
let lastState: AlarmState = 'DISARMED';
let sonarPingInterval: number | null = null;

function handleAlarmStateChange(state: AlarmState, distance: number): void {
  // Update alarm status readout
  updateAlarmStatusUI(state);

  const radius = gpsEngine.getAlarmRadius();

  // 1. Telemetry Gauges Color Classes
  elDistVal.innerText = distance > 0 ? distance.toFixed(1) : '--.-';
  
  if (state === 'DISARMED') {
    elDistVal.className = 'digital-value';
    elScopeProgress.style.width = '0%';
    elScopeProgress.style.backgroundColor = 'var(--neon-blue)';
    elScopeProgress.style.boxShadow = '0 0 8px var(--neon-blue)';
  } else {
    // Update Scope Progress bar
    const pct = Math.min((distance / radius) * 100, 100);
    elScopeProgress.style.width = `${pct}%`;

    if (state === 'SAFE') {
      elDistVal.className = 'digital-value safe';
      elScopeProgress.style.backgroundColor = 'var(--neon-green)';
      elScopeProgress.style.boxShadow = '0 0 8px var(--neon-green)';
    } else if (state === 'WARNING') {
      elDistVal.className = 'digital-value warning';
      elScopeProgress.style.backgroundColor = 'var(--neon-orange)';
      elScopeProgress.style.boxShadow = '0 0 8px var(--neon-orange)';
    } else if (state === 'ALARM') {
      elDistVal.className = 'digital-value alarm';
      elScopeProgress.style.backgroundColor = 'var(--neon-red)';
      elScopeProgress.style.boxShadow = '0 0 12px var(--neon-red)';
    } else if (state === 'PAUSED') {
      elDistVal.className = 'digital-value paused';
      elScopeProgress.style.backgroundColor = '#6c7a89';
      elScopeProgress.style.boxShadow = '0 0 8px #6c7a89';
    }
  }

  // 2. Redraw Circle Overlays with state-based color styling
  const anchor = gpsEngine.getAnchor();
  if (anchor) {
    appMap.updateAnchorMarker(
      anchor.lat, 
      anchor.lng, 
      radius, 
      state,
      gpsEngine.getUseSectorAlarm(),
      gpsEngine.getSectorWidth(),
      gpsEngine.getSectorHeading(),
      gpsEngine.getLockAnchorAfterSet()
    );
  }

  // 3. Trigger Synthesized Audio Warnings & Flashing Panels
  if (state !== lastState) {
    // State transitioned! Adjust audios
    audioSynth.silenceAll();
    
    // Clear active sonar interval if active
    if (sonarPingInterval) {
      window.clearInterval(sonarPingInterval);
      sonarPingInterval = null;
    }

    if (state === 'SAFE') {
      // Periodic comforting sonar ping every 25 seconds while armed and safe
      if (gpsEngine.getEnableSonar()) {
        audioSynth.playSonarPing();
      }
      sonarPingInterval = window.setInterval(() => {
        if (gpsEngine.getIsArmed() && gpsEngine.getEnableSonar()) {
          audioSynth.playSonarPing();
        }
      }, 25000);
      
      elAlarmStrobe.classList.add('hidden');
    } else if (state === 'WARNING') {
      audioSynth.startWarningBeeps();
      elAlarmStrobe.classList.add('hidden');
    } else if (state === 'ALARM') {
      // Aggressive drift siren!
      audioSynth.startSiren();
      
      // Reveal screaming strobe panel
      elAlarmStrobe.classList.remove('hidden');
      elStrobeDistance.innerText = distance.toFixed(1);
      elStrobeRadius.innerText = radius.toString();
    } else if (state === 'DISARMED') {
      elAlarmStrobe.classList.add('hidden');
    } else if (state === 'PAUSED') {
      elAlarmStrobe.classList.add('hidden');
    }

    lastState = state;
  } else if (state === 'ALARM') {
    // Keep strobe stats refreshed in real-time
    elStrobeDistance.innerText = distance.toFixed(1);
  }

  // 4. E2EE Boat mode broadcast
  if (syncManager.getMode() === 'boat') {
    const pos = gpsEngine.getCurrentPosition();
    if (pos) {
      syncManager.broadcast(pos, gpsEngine, distance, state);
    }
  }
}

/**
 * Updates indicators in header
 */
function updateAlarmStatusUI(state: AlarmState): void {
  elStatusAlarm.className = 'indicator';
  const txt = elStatusAlarm.querySelector('.text') as HTMLSpanElement;
  const lang = gpsEngine.getLanguage();

  switch (state) {
    case 'DISARMED':
      elStatusAlarm.classList.add('alarm-disarmed');
      txt.innerText = t('status_inactive', lang);
      break;
    case 'SAFE':
      elStatusAlarm.classList.add('alarm-armed');
      txt.innerText = t('status_armed', lang);
      break;
    case 'WARNING':
      elStatusAlarm.classList.add('alarm-warning');
      txt.innerText = t('status_warning', lang);
      break;
    case 'ALARM':
      elStatusAlarm.classList.add('alarm-triggered');
      txt.innerText = t('status_alarm', lang);
      break;
    case 'PAUSED':
      elStatusAlarm.classList.add('alarm-paused');
      txt.innerText = t('status_paused', lang);
      break;
  }
}



function enableAnchorTuningButtons(enable: boolean): void {
  const btns = [elPadN, elPadS, elPadE, elPadW];
  btns.forEach(btn => {
    if (!btn) return;
    if (enable) {
      btn.classList.remove('btn-disabled');
      btn.removeAttribute('disabled');
    } else {
      btn.classList.add('btn-disabled');
      btn.setAttribute('disabled', 'true');
    }
  });
}

function updateAnchorButtonUI(): void {
  if (!elBtnAnchorSet) return;
  const anchor = gpsEngine.getAnchor();
  const labelSpan = elBtnAnchorSet.querySelector('span[data-i18n]') as HTMLSpanElement;
  if (anchor) {
    if (labelSpan) {
      labelSpan.dataset.i18n = 'alarm_disarm';
      labelSpan.textContent = t('alarm_disarm', gpsEngine.getLanguage());
    }
    elBtnAnchorSet.setAttribute('color', 'danger');
    enableAnchorTuningButtons(true);
    if (elAnchorAdjusterPanel) {
      elAnchorAdjusterPanel.classList.remove('hidden');
    }
    if (elBtnAnchorPause) {
      elBtnAnchorPause.classList.remove('hidden');
      const pauseLabelSpan = elBtnAnchorPause.querySelector('span[data-i18n]') as HTMLSpanElement;
      if (gpsEngine.getIsPaused()) {
        if (pauseLabelSpan) {
          pauseLabelSpan.dataset.i18n = 'anchor_resume';
          pauseLabelSpan.textContent = t('anchor_resume', gpsEngine.getLanguage());
        }
        elBtnAnchorPause.setAttribute('color', 'success');
      } else {
        if (pauseLabelSpan) {
          pauseLabelSpan.dataset.i18n = 'anchor_pause';
          pauseLabelSpan.textContent = t('anchor_pause', gpsEngine.getLanguage());
        }
        elBtnAnchorPause.setAttribute('color', 'warning');
      }
    }
  } else {
    if (labelSpan) {
      labelSpan.dataset.i18n = 'anchor_set';
      labelSpan.textContent = t('anchor_set', gpsEngine.getLanguage());
    }
    elBtnAnchorSet.setAttribute('color', 'secondary');
    enableAnchorTuningButtons(false);
    if (elAnchorAdjusterPanel) {
      elAnchorAdjusterPanel.classList.add('hidden');
    }
    if (elBtnAnchorPause) {
      elBtnAnchorPause.classList.add('hidden');
    }
  }
}

function populateRadiusSelectOptions(unit: 'm' | 'ft'): void {
  if (!elSelectRadius) return;
  
  // Clear existing options
  elSelectRadius.innerHTML = '';
  
  // Dynamically generate values based on unit (meters: 3m to 150m in 1m steps; feet: 10ft to 500ft in 5ft steps)
  const values: number[] = [];
  if (unit === 'ft') {
    for (let i = 10; i <= 500; i += 5) {
      values.push(i);
    }
  } else {
    for (let i = 3; i <= 150; i += 1) {
      values.push(i);
    }
  }
    
  const unitLabel = unit === 'ft' ? 'ft' : 'm';
  
  values.forEach(val => {
    const opt = document.createElement('ion-select-option') as any;
    opt.value = val.toString();
    opt.textContent = `${val} ${unitLabel}`;
    elSelectRadius.appendChild(opt);
  });
  
  // Set current selected value
  const r = gpsEngine.getAlarmRadius();
  const closest = values.reduce((prev, curr) => Math.abs(curr - r) < Math.abs(prev - r) ? curr : prev);
  elSelectRadius.value = closest.toString();
  
  if (closest !== r) {
    gpsEngine.setAlarmRadius(closest);
  }
}

function toggleSectorSettingsState(active: boolean): void {
  if (active) {
    if (elSectorSettingsControls) elSectorSettingsControls.classList.remove('hidden');
    if (elSectorWidthSlider) elSectorWidthSlider.removeAttribute('disabled');
    if (elSectorHeadingSlider) elSectorHeadingSlider.removeAttribute('disabled');
  } else {
    if (elSectorSettingsControls) elSectorSettingsControls.classList.add('hidden');
    if (elSectorWidthSlider) elSectorWidthSlider.setAttribute('disabled', 'true');
    if (elSectorHeadingSlider) elSectorHeadingSlider.setAttribute('disabled', 'true');
  }
}

/* ==========================================================================
   3. Setup User Control Listeners
   ========================================================================== */

function setupEventListeners(): void {
  // A. Radius Dropdown Change Event
  if (elSelectRadius) {
    elSelectRadius.addEventListener('ionChange', (e: any) => {
      const r = parseInt(e.detail.value, 10);
      gpsEngine.setAlarmRadius(r);
      triggerMapAnchorUpdate();
    });
  }

  const bindPadBtn = (btn: HTMLButtonElement, dir: 'N' | 'S' | 'E' | 'W') => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      audioSynth.unlock();
      gpsEngine.shiftAnchor(dir, 1); // shift exactly 1 meter
      const anchor = gpsEngine.getAnchor();
      if (anchor) {
        const r = gpsEngine.getAlarmRadius();
        appMap.updateAnchorMarker(
          anchor.lat, 
          anchor.lng, 
          r, 
          gpsEngine.getIsArmed() ? lastState : 'DISARMED',
          gpsEngine.getUseSectorAlarm(),
          gpsEngine.getSectorWidth(),
          gpsEngine.getSectorHeading(),
          gpsEngine.getLockAnchorAfterSet()
        );
        // Force boat heading to update toward the shifted anchor position
        const boatLatLng = appMap.getBoatLatLng();
        if (boatLatLng) {
          appMap.updateBoatMarker({
            lat: boatLatLng.lat,
            lng: boatLatLng.lng,
            accuracy: 0,
            speed: null,
            heading: null,
            timestamp: Date.now()
          });
        }
      }
    });
  };

  bindPadBtn(elPadN, 'N');
  bindPadBtn(elPadS, 'S');
  bindPadBtn(elPadE, 'E');
  bindPadBtn(elPadW, 'W');

  // B. Drop/Lift Anchor Button & Coupled Alarm Toggle
  elBtnAnchorSet.addEventListener('click', async () => {
    audioSynth.unlock();
    const existingAnchor = gpsEngine.getAnchor();
    if (existingAnchor) {
      if (confirm(t('lift_anchor_confirm', gpsEngine.getLanguage()))) {
        // Stop simulation if active
        if (gpsEngine.getIsSimulationMode()) {
          gpsEngine.setSimulationMode(false);
          // Reset local simulation state
          simMode = null;
          if (simSwayIntervalId !== null) {
            window.clearInterval(simSwayIntervalId);
            simSwayIntervalId = null;
          }
          elBtnSimMode.classList.remove('active');
          elSimControlPanel.classList.add('hidden');
          updateSimModeButtons();
        }
        gpsEngine.clearAnchor();
        gpsEngine.clearVesselHistory();
        appMap.clearAnchor(); // Remove anchor marker and safety circle/sector from map
        appMap.clearVesselTrack();
        
        updateAnchorButtonUI();
        
        // Coupled Deactivation: Release Wake Lock and silence alarms
        await wakeLockManager.release();
        audioSynth.silenceAll();
      }
      return;
    }
    
    // Set anchor
    let targetLat = 54.3210;
    let targetLng = 10.1234;
    
    const boatLatLng = appMap.getBoatLatLng();
    if (boatLatLng) {
      targetLat = boatLatLng.lat;
      targetLng = boatLatLng.lng;
    }
    
    gpsEngine.setAnchor(targetLat, targetLng);
    const r = gpsEngine.getAlarmRadius();
    appMap.updateAnchorMarker(
      targetLat, 
      targetLng, 
      r, 
      'SAFE', // Automatically Safe/Armed
      gpsEngine.getUseSectorAlarm(),
      gpsEngine.getSectorWidth(),
      gpsEngine.getSectorHeading(),
      gpsEngine.getLockAnchorAfterSet()
    );
    
    updateAnchorButtonUI();
 
    // Coupled Activation: Request Wake Lock and play confirmation
    await wakeLockManager.acquire();
    if (gpsEngine.getEnableSonar()) {
      audioSynth.playSonarPing();
    }
  });

  if (elBtnAnchorPause) {
    elBtnAnchorPause.addEventListener('click', () => {
      audioSynth.unlock();
      const paused = !gpsEngine.getIsPaused();
      gpsEngine.setPaused(paused);
      updateAnchorButtonUI();
      if (paused) {
        audioSynth.silenceAll();
        elAlarmStrobe.classList.add('hidden');
      }
    });
  }

  // D. Strobe Alarm Screen Mute (Silences siren but keeps anchor set)
  elStrobeMuteBtn.addEventListener('click', () => {
    audioSynth.silenceAll();
    elAlarmStrobe.classList.add('hidden');
  });

  // E. Map Layer Buttons Selector
  elMapLayerBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      elMapLayerBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('fill', 'outline');
      });
      btn.classList.add('active');
      btn.setAttribute('fill', 'solid');
      const layer = btn.getAttribute('data-layer') as 'seamap' | 'topo' | 'satellite' | 'dark';
      appMap.setLayer(layer);
    });
  });

  // F. Sound Check Button
  elBtnSoundTest.addEventListener('click', () => {
    elBtnSoundTest.classList.add('active');
    audioSynth.triggerSoundCheck();
    setTimeout(() => elBtnSoundTest.classList.remove('active'), 2500);
  });

  // F2. OSM Anchorage Spots Toggle
  elBtnAnchorageToggle.addEventListener('click', () => {
    audioSynth.unlock();
    const isNowVisible = appMap.toggleAnchorageLayer();
    elBtnAnchorageToggle.classList.toggle('active', isNowVisible);
    elBtnAnchorageToggle.title = isNowVisible
      ? 'OSM-Ankerplätze ausblenden'
      : 'OSM-Ankerplätze anzeigen';
  });

  // G. Simulator Mode Button Toggle
  elBtnSimMode.addEventListener('click', () => {
    const isSimActive = gpsEngine.getIsSimulationMode();
    const newSimState = !isSimActive;

    gpsEngine.setSimulationMode(newSimState);
    
    if (newSimState) {
      elBtnSimMode.classList.add('active');
      elSimControlPanel.classList.remove('hidden');
      
      // Place initial simulator position
      const anchor = gpsEngine.getAnchor();
      if (!anchor) {
        gpsEngine.setAnchor(54.3210, 10.1234);
        appMap.updateAnchorMarker(
          54.3210, 
          10.1234, 
          gpsEngine.getAlarmRadius(), 
          'SAFE', // Automatically Safe/Armed
          gpsEngine.getUseSectorAlarm(),
          gpsEngine.getSectorWidth(),
          gpsEngine.getSectorHeading(),
          gpsEngine.getLockAnchorAfterSet()
        );
        updateAnchorButtonUI();
        wakeLockManager.acquire();
      }
      gpsEngine.startSwingSimulation();
      simMode = 'swing'; // default: swing mode on activation
      updateSimModeButtons();

      // Start background simulation loop
      if (simSwayIntervalId === null) {
        simSwayIntervalId = window.setInterval(() => {
          if (simMode === 'drift') {
            gpsEngine.simulateSwayStep(true);
          } else if (simMode === 'swing') {
            gpsEngine.simulateSwingAtAnchor();
          }
        }, 1000);
      }
    } else {
      elBtnSimMode.classList.remove('active');
      elSimControlPanel.classList.add('hidden');
      simMode = null;
      
      // Clear simulation loop
      if (simSwayIntervalId !== null) {
        window.clearInterval(simSwayIntervalId);
        simSwayIntervalId = null;
      }
    }
  });

  // H. Simulator mode selection buttons
  elBtnSimSwing.addEventListener('click', () => {
    simMode = 'swing';
    gpsEngine.startSwingSimulation();
    updateSimModeButtons();
  });

  elBtnSimDrift.addEventListener('click', () => {
    simMode = 'drift';
    gpsEngine.startDriftSimulation();
    updateSimModeButtons();
  });

  elBtnSimReset.addEventListener('click', () => {
    audioSynth.unlock();
    
    // 1. Exit simulation mode in gpsEngine (this will clear simVesselHistory and return to tracking if armed)
    gpsEngine.setSimulationMode(false);
    
    // 2. Hide simulation control panel and remove active class from simulator button
    simMode = null;
    elBtnSimMode.classList.remove('active');
    elSimControlPanel.classList.add('hidden');
    
    // 3. Stop background simulation loop if active
    if (simSwayIntervalId !== null) {
      window.clearInterval(simSwayIntervalId);
      simSwayIntervalId = null;
    }
    
    // 4. Force immediate map redraw to clear simulation track and restore real track
    appMap.drawVesselTrack(
      gpsEngine.getVesselHistory(), 
      gpsEngine.getDisplayLimitHours(),
      gpsEngine.getTrackPointSize(),
      gpsEngine.getTrackMinOpacity()
    );
    
    // 5. Update UI buttons
    updateSimModeButtons();
  });

  // I. Settings Toggle Buttons
  elBtnSettings.addEventListener('click', () => {
    audioSynth.unlock();
    const menu = document.getElementById('settings-menu') as any;
    if (menu) menu.open();
  });

  elBtnSettingsClose.addEventListener('click', () => {
    audioSynth.unlock();
    const menu = document.getElementById('settings-menu') as any;
    if (menu) menu.close();
  });

  // Settings Tabs: Tab bar clicks + touch swipe
  setupSettingsTabs();

  // J. Sector Alarm Settings Controls (Using Ionic ionChange and ionInput)
  elChkSectorEnable.addEventListener('ionChange', (e: any) => {
    const checked = !!e.detail.checked;
    gpsEngine.setUseSectorAlarm(checked);
    toggleSectorSettingsState(checked);
    triggerMapAnchorUpdate();
  });

  elSectorWidthSlider.addEventListener('ionInput', (e: any) => {
    const val = parseInt(e.target.value, 10);
    elSectorWidthVal.innerText = val.toString();
    gpsEngine.setSectorWidth(val);
    triggerMapAnchorUpdate();
  });

  elSectorHeadingSlider.addEventListener('ionInput', (e: any) => {
    const val = parseInt(e.target.value, 10);
    elSectorHeadingVal.innerText = val.toString();
    gpsEngine.setSectorHeading(val);
    triggerMapAnchorUpdate();
  });

  // K. Track Logs Settings Controls (Using Ionic ionInput and ionChange)
  elHistoryLimitSlider.addEventListener('ionInput', (e: any) => {
    const val = parseInt(e.target.value, 10);
    elHistoryLimitVal.innerText = val.toString();
    gpsEngine.setHistoryLimitHours(val);
  });

  elSelectDisplayLimit.addEventListener('ionChange', (e: any) => {
    const val = parseInt(e.target.value, 10);
    gpsEngine.setDisplayLimitHours(val);
    appMap.drawVesselTrack(
      gpsEngine.getVesselHistory(), 
      val,
      gpsEngine.getTrackPointSize(),
      gpsEngine.getTrackMinOpacity()
    );
  });

  elTrackPointSizeSlider.addEventListener('ionInput', (e: any) => {
    const val = parseInt(e.target.value, 10);
    elTrackPointSizeVal.innerText = val.toString();
    gpsEngine.setTrackPointSize(val);
    appMap.drawVesselTrack(
      gpsEngine.getVesselHistory(), 
      gpsEngine.getDisplayLimitHours(), 
      val, 
      gpsEngine.getTrackMinOpacity()
    );
  });

  elTrackMinOpacitySlider.addEventListener('ionInput', (e: any) => {
    const val = parseInt(e.target.value, 10);
    elTrackMinOpacityVal.innerText = val.toString();
    gpsEngine.setTrackMinOpacity(val);
    appMap.drawVesselTrack(
      gpsEngine.getVesselHistory(), 
      gpsEngine.getDisplayLimitHours(), 
      gpsEngine.getTrackPointSize(), 
      val
    );
  });

  elSelectThemeColor.addEventListener('ionChange', (e: any) => {
    const color = e.target.value;
    gpsEngine.setThemeColor(color);
    appMap.setThemeColor(color);
    
    // Redraw map elements instantly with the new theme color!
    triggerMapAnchorUpdate();
    appMap.drawVesselTrack(
      gpsEngine.getVesselHistory(),
      gpsEngine.getDisplayLimitHours(),
      gpsEngine.getTrackPointSize(),
      gpsEngine.getTrackMinOpacity()
    );
  });

  elSelectTrackInterval.addEventListener('ionChange', (e: any) => {
    const val = parseInt(e.target.value, 10);
    gpsEngine.setTrackIntervalSeconds(val);
  });

  // Language manual selection event listener
  elSelectLanguage.addEventListener('ionChange', (e: any) => {
    const lang = e.target.value as LanguageCode;
    gpsEngine.setLanguage(lang);
    translateDOM(lang);
    
    // Dynamically update the anchor button label in real-time
    updateAnchorButtonUI();

    // Redraw indicators using new language dictionary
    updateAlarmStatusUI(lastState);
    triggerMapAnchorUpdate();
  });

  // Anchor lock toggle selection listener
  elChkLockAnchor.addEventListener('ionChange', (e: any) => {
    const checked = !!e.detail.checked;
    gpsEngine.setLockAnchorAfterSet(checked);
    triggerMapAnchorUpdate();
  });

  if (elChkEnableSonar) {
    elChkEnableSonar.addEventListener('ionChange', (e: any) => {
      const checked = !!e.detail.checked;
      gpsEngine.setEnableSonar(checked);
    });
  }

  elBtnClearTrack.addEventListener('click', () => {
    audioSynth.unlock();
    if (confirm(t('confirm_clear_track', gpsEngine.getLanguage()))) {
      gpsEngine.clearVesselHistory();
      appMap.clearVesselTrack();
    }
  });

  if (elBtnClearTrackQuick) {
    elBtnClearTrackQuick.addEventListener('click', () => {
      audioSynth.unlock();
      if (confirm(t('confirm_clear_track', gpsEngine.getLanguage()))) {
        gpsEngine.clearVesselHistory();
        appMap.clearVesselTrack();
      }
    });
  }

  elSelectLengthUnit.addEventListener('ionChange', (e: any) => {
    const unit = e.target.value as 'm' | 'ft';
    gpsEngine.setLengthUnit(unit);
    // Sync radius select dropdown to new unit
    populateRadiusSelectOptions(unit);
    triggerMapAnchorUpdate();
  });

  /* -----------------------------------------------------------------------
     Settings Tab switching + touch/pointer swipe support
     ----------------------------------------------------------------------- */
  function setupSettingsTabs() {
    if (!elTabsTrack || !elTabsViewport) {
      console.warn("OpenAnchor: Settings tab elements not found in DOM yet.");
      return;
    }
    const tabCount = elTabBtns.length; // 3
    let activeTabIndex = 0;

    function goToTab(index: number, animate = true) {
      activeTabIndex = Math.max(0, Math.min(tabCount - 1, index));

      // Update tab bar active state
      elTabBtns.forEach((btn, i) => {
        btn.classList.toggle('active', i === activeTabIndex);
        btn.setAttribute('aria-selected', String(i === activeTabIndex));
      });

      // Slide the track
      if (!animate) elTabsTrack.style.transition = 'none';
      // translateX by -(activeIndex / 3) * 100% of the track's own width
      const pct = (activeTabIndex * 100) / tabCount;
      elTabsTrack.style.transform = `translateX(-${pct}%)`;
      if (!animate) {
        // Force reflow, then re-enable transition
        elTabsTrack.getBoundingClientRect();
        elTabsTrack.style.transition = '';
      }
    }

    // Tab bar clicks
    elTabBtns.forEach((btn, i) => {
      btn.addEventListener('click', () => goToTab(i));
    });

    // Touch/pointer swipe inside the viewport
    let pointerStartX = 0;
    let pointerStartY = 0;
    let isPointerDown = false;

    elTabsViewport.addEventListener('pointerdown', (e: PointerEvent) => {
      isPointerDown = true;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
    }, { passive: true });

    elTabsViewport.addEventListener('pointermove', (e: PointerEvent) => {
      if (!isPointerDown) return;
      const dx = e.clientX - pointerStartX;
      const dy = e.clientY - pointerStartY;
      // If predominantly vertical movement, don't interfere with page scroll
      if (Math.abs(dy) > Math.abs(dx)) return;
      e.preventDefault();
    }, { passive: false });

    elTabsViewport.addEventListener('pointerup', (e: PointerEvent) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      const dx = e.clientX - pointerStartX;
      const dy = e.clientY - pointerStartY;
      const SWIPE_THRESHOLD = 40;
      // Only trigger horizontal swipe when clearly not a vertical scroll
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) {
          goToTab(activeTabIndex + 1); // swipe left → next tab
        } else {
          goToTab(activeTabIndex - 1); // swipe right → prev tab
        }
      }
    }, { passive: true });

    elTabsViewport.addEventListener('pointercancel', () => {
      isPointerDown = false;
    });
  }

  function triggerMapAnchorUpdate() {
    const a = gpsEngine.getAnchor();
    if (a) {
      const r = gpsEngine.getAlarmRadius();
      appMap.updateAnchorMarker(
        a.lat,
        a.lng,
        r,
        gpsEngine.getIsArmed() ? lastState : 'DISARMED',
        gpsEngine.getUseSectorAlarm(),
        gpsEngine.getSectorWidth(),
        gpsEngine.getSectorHeading(),
        gpsEngine.getLockAnchorAfterSet()
      );
    }
  }
}

function updateSimModeButtons(): void {
  // Highlight whichever mode is active
  elBtnSimSwing.classList.toggle('active', simMode === 'swing');
  elBtnSimDrift.classList.toggle('active', simMode === 'drift');
  elBtnSimReset.classList.toggle('active', simMode === null);
}

/* ==========================================================================
   4. App Startup Bootstrap
   ========================================================================== */

window.addEventListener('DOMContentLoaded', () => {
  initApp();
  
  // Staggered Leaflet map size invalidation to resolve Ionic asynchronous rendering size calculation glitch
  const triggerInvalidate = () => {
    if (appMap) {
      appMap.invalidateSize();
    }
  };

  triggerInvalidate();
  setTimeout(triggerInvalidate, 100);
  setTimeout(triggerInvalidate, 350);
  setTimeout(triggerInvalidate, 800);
  setTimeout(triggerInvalidate, 1800);

  // Invalidate when ion-content is fully defined/upgraded
  if (window.customElements && typeof window.customElements.whenDefined === 'function') {
    window.customElements.whenDefined('ion-content').then(() => {
      setTimeout(triggerInvalidate, 200);
    });
  }

  // Handle screen rotation/resizes
  window.addEventListener('resize', triggerInvalidate);
  
  // Register Service Worker for offline PWA operation (web only, disable in native Capacitor apps)
  if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('OpenAnchor: Service Worker registered: ', reg.scope);
      })
      .catch((err) => {
        console.error('OpenAnchor: Service Worker failed: ', err);
      });
  } else if (Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
    // Unregister any existing service workers to clear cache for native app upgrades
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
        console.log('OpenAnchor: Unregistered stray Service Worker in native shell.');
      }
    });
  }
});

/* ==========================================================================
   5. E2EE Multi-Device Synchronization & Shore Monitoring
   ========================================================================== */

function setupSyncFeature(): void {
  // Listen to status changes from syncManager
  syncManager.onStatusChanged((status: SyncStatus) => {
    if (elSyncStatusVal) {
      const lang = gpsEngine.getLanguage();
      let text = t(status.key, lang);
      if (status.param !== undefined) {
        text = text.replace('{count}', String(status.param)).replace('{error}', String(status.param));
      }
      elSyncStatusVal.innerText = text;
      elSyncStatusVal.style.color = status.isError 
        ? 'var(--neon-red)' 
        : (syncManager.getIsConnected() ? 'var(--neon-green)' : '#8c9bb4');
    }
    updateSyncBadgeVisibility();
  });

  // Listen to incoming telemetry from shore monitor
  syncManager.onTelemetryReceived((telemetry) => {
    if (syncManager.getMode() !== 'shore') return;

    // 1. Store remote history
    const pos: GPSPosition = {
      lat: telemetry.position.lat,
      lng: telemetry.position.lng,
      accuracy: telemetry.position.accuracy,
      speed: telemetry.position.speed,
      heading: telemetry.position.heading,
      timestamp: telemetry.timestamp
    };

    // Prevent duplicate coordinates in remote history
    const lastPoint = remoteHistory[remoteHistory.length - 1];
    if (!lastPoint || lastPoint.lat !== pos.lat || lastPoint.lng !== pos.lng || lastPoint.timestamp !== pos.timestamp) {
      remoteHistory.push(pos);
      // Cap remote history length to history limit to avoid memory leaks
      const maxPoints = 2000;
      if (remoteHistory.length > maxPoints) {
        remoteHistory.shift();
      }
    }

    // 2. Set the remote state in gpsEngine
    gpsEngine.setRemoteState(telemetry);

    // 3. Update the UI & map
    handlePositionUpdate(pos);
    handleAlarmStateChange(telemetry.alarm.alarmState, telemetry.alarm.distance);
  });

  // Handle Sync Mode Selector segment clicks
  if (elSyncModeSelector) {
    elSyncModeSelector.addEventListener('ionChange', async (e: any) => {
      const mode = e.detail.value as SyncMode;
      if (mode === 'none') {
        syncManager.disconnect();
        if (elSyncPanelBoat) elSyncPanelBoat.classList.add('hidden');
        if (elSyncPanelShore) elSyncPanelShore.classList.add('hidden');
        
        // Re-enable local inputs
        elBtnAnchorSet.removeAttribute('disabled');
        enableAnchorTuningButtons(gpsEngine.getIsArmed() && !gpsEngine.getLockAnchorAfterSet());
        if (elChkLockAnchor) elChkLockAnchor.removeAttribute('disabled');
        if (elChkSectorEnable) elChkSectorEnable.removeAttribute('disabled');
        if (elSectorWidthSlider) elSectorWidthSlider.removeAttribute('disabled');
        if (elSectorHeadingSlider) elSectorHeadingSlider.removeAttribute('disabled');
        if (elSelectRadius) elSelectRadius.removeAttribute('disabled');

        // Restart local tracking
        gpsEngine.startTracking();
        updateSyncBadgeVisibility();

      } else if (mode === 'boat') {
        if (elSyncPanelBoat) elSyncPanelBoat.classList.remove('hidden');
        if (elSyncPanelShore) elSyncPanelShore.classList.add('hidden');

        try {
          const session = await syncManager.generateSession();
          const dataUrl = await syncManager.generateQrCodeDataUrl(session.qrText);
          if (elSyncQrImage) {
            elSyncQrImage.src = dataUrl;
            elSyncQrImage.style.display = 'block';
          }
          if (elSyncQrPlaceholder) elSyncQrPlaceholder.style.display = 'none';
          if (elSyncTopicDisplay) elSyncTopicDisplay.innerText = session.topic;

          await syncManager.startBoatMode(session.qrText);
          updateSyncBadgeVisibility();
        } catch (err) {
          console.error("Failed to start boat mode:", err);
        }

      } else if (mode === 'shore') {
        if (elSyncPanelShore) elSyncPanelShore.classList.remove('hidden');
        if (elSyncPanelBoat) elSyncPanelBoat.classList.add('hidden');

        syncManager.disconnect();
        // Stop local tracking, as we are displaying remote telemetry
        gpsEngine.stopTracking();
        updateSyncBadgeVisibility();
      }
    });
  }

  // QR Code Scanning button
  if (elBtnSyncScan) {
    elBtnSyncScan.addEventListener('click', () => {
      audioSynth.unlock();
      startQrScanner();
    });
  }

  // Manual Connection button
  if (elBtnSyncManualConnect) {
    elBtnSyncManualConnect.addEventListener('click', async () => {
      audioSynth.unlock();
      if (elSyncManualInput) {
        const val = elSyncManualInput.value.trim();
        if (val) {
          await handleRemoteConnection(val);
        } else {
          const lang = gpsEngine.getLanguage();
          alert(t('sync_manual_placeholder', lang));
        }
      }
    });
  }

  // Attempt to restore persistent session on reload
  const savedMode = localStorage.getItem('openanchor_sync_mode');
  const savedConfig = localStorage.getItem('openanchor_sync_config');
  if (savedMode === 'shore' && savedConfig) {
    if (elSyncModeSelector) elSyncModeSelector.value = 'shore';
    if (elSyncPanelShore) elSyncPanelShore.classList.remove('hidden');
    handleRemoteConnection(savedConfig);
  }
}

function updateSyncBadgeVisibility(): void {
  if (elHeaderRemoteBadge) {
    if (syncManager.getMode() !== 'none' && syncManager.getIsConnected()) {
      elHeaderRemoteBadge.classList.remove('hidden');
      const badgeTextSpan = elHeaderRemoteBadge.querySelector('span:not(.dot)') as HTMLSpanElement;
      if (badgeTextSpan) {
        const lang = gpsEngine.getLanguage();
        badgeTextSpan.innerText = t(syncManager.getMode() === 'boat' ? 'sync_mode_boat' : 'sync_mode_shore', lang);
      }
    } else {
      elHeaderRemoteBadge.classList.add('hidden');
    }
  }
}

async function handleRemoteConnection(qrText: string): Promise<void> {
  const lang = gpsEngine.getLanguage();
  try {
    const config = JSON.parse(qrText);
    if (!config.t || !config.k || !config.b) {
      throw new Error(t('sync_invalid_config', lang));
    }

    if (elSyncStatusVal) elSyncStatusVal.innerText = t('sync_status_connecting', lang);
    await syncManager.startShoreMode(qrText);

    // Persist configuration in localStorage so we can resume if connection drops
    localStorage.setItem('openanchor_sync_config', qrText);

    // Disable all local inputs that modify alarm configuration
    elBtnAnchorSet.setAttribute('disabled', 'true');
    enableAnchorTuningButtons(false);
    if (elChkLockAnchor) elChkLockAnchor.setAttribute('disabled', 'true');
    if (elChkSectorEnable) elChkSectorEnable.setAttribute('disabled', 'true');
    if (elSectorWidthSlider) elSectorWidthSlider.setAttribute('disabled', 'true');
    if (elSectorHeadingSlider) elSectorHeadingSlider.setAttribute('disabled', 'true');
    if (elSelectRadius) elSelectRadius.setAttribute('disabled', 'true');

    updateSyncBadgeVisibility();
  } catch (err: any) {
    console.error("Failed to connect Shore mode:", err);
    alert(t('sync_alert_connecting', lang) + err.message);
    if (elSyncStatusVal) {
      elSyncStatusVal.innerText = t('sync_connect_error_label', lang);
      elSyncStatusVal.style.color = "var(--neon-red)";
    }
  }
}

async function startQrScanner(): Promise<void> {
  const lang = gpsEngine.getLanguage();
  // Check if BarcodeDetector is supported in browser
  const hasBarcodeDetector = 'BarcodeDetector' in window;
  if (!hasBarcodeDetector) {
    alert(t('sync_alert_detector', lang));
    return;
  }

  // Create scanner UI overlay dynamically
  const scannerOverlay = document.createElement('div');
  scannerOverlay.id = 'qr-scanner-overlay';
  scannerOverlay.style.position = 'fixed';
  scannerOverlay.style.top = '0';
  scannerOverlay.style.left = '0';
  scannerOverlay.style.width = '100%';
  scannerOverlay.style.height = '100%';
  scannerOverlay.style.backgroundColor = 'rgba(5, 11, 20, 0.95)';
  scannerOverlay.style.zIndex = '9999';
  scannerOverlay.style.display = 'flex';
  scannerOverlay.style.flexDirection = 'column';
  scannerOverlay.style.alignItems = 'center';
  scannerOverlay.style.justifyContent = 'center';

  scannerOverlay.innerHTML = `
    <div style="position: relative; width: 280px; height: 280px; border: 2px solid var(--neon-blue); border-radius: 8px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 0 20px rgba(0, 210, 255, 0.3);">
      <video id="scanner-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
      <div style="position: absolute; top: 0; left: 0; width: 100%; height: 2px; background: var(--neon-blue); box-shadow: 0 0 8px var(--neon-blue); animation: scan-line 2s linear infinite;"></div>
    </div>
    <p style="color: #8c9bb4; font-size: 0.9rem; margin-bottom: 24px; text-align: center; padding: 0 20px;">
      ${t('sync_scanner_prompt', lang)}
    </p>
    <ion-button id="btn-scanner-close" fill="outline" style="--border-color: var(--neon-red); --color: var(--neon-red); font-weight: 600;">
      ${t('sync_scanner_cancel', lang)}
    </ion-button>
    <style>
      @keyframes scan-line {
        0% { top: 0%; }
        50% { top: 100%; }
        100% { top: 0%; }
      }
    </style>
  `;

  document.body.appendChild(scannerOverlay);

  const video = document.getElementById('scanner-video') as HTMLVideoElement;
  const btnClose = document.getElementById('btn-scanner-close') as any;

  let stream: MediaStream | null = null;
  let scanIntervalId: any = null;

  const stopScan = () => {
    if (scanIntervalId) clearInterval(scanIntervalId);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    scannerOverlay.remove();
  };

  btnClose.addEventListener('click', stopScan);

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = stream;

    // Initialize BarcodeDetector
    // @ts-ignore
    const detector = new BarcodeDetector({ formats: ['qr_code'] });

    scanIntervalId = setInterval(async () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            console.log("QR Code scanned:", rawValue);
            stopScan();
            await handleRemoteConnection(rawValue);
          }
        } catch (err) {
          console.error("Error detecting barcode:", err);
        }
      }
    }, 300);

  } catch (err: any) {
    console.error("Camera access failed:", err);
    alert(t('sync_alert_camera_failed', lang) + err.message);
    stopScan();
  }
}
