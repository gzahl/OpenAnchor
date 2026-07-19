import mqtt from 'mqtt';
import QRCode from 'qrcode';
import type { GPSPosition, AlarmState } from './gps';

export interface SyncStatus {
  key: string;
  param?: string | number;
  isError: boolean;
}

export interface SyncTelemetry {
  timestamp: number;
  position: {
    lat: number;
    lng: number;
    accuracy: number;
    speed: number | null;
    heading: number | null;
  };
  alarm: {
    isArmed: boolean;
    anchor: { lat: number; lng: number } | null;
    alarmRadius: number;
    alarmState: AlarmState;
    distance: number;
    useSectorAlarm: boolean;
    sectorWidth: number;
    sectorHeading: number;
    isPaused: boolean;
  };
}

export type SyncMode = 'none' | 'boat' | 'shore';

export class SyncManager {
  private mode: SyncMode = 'none';
  private client: mqtt.MqttClient | null = null;
  private secretKey: CryptoKey | null = null;
  private topic = '';
  private broker = 'broker.hivemq.com';
  private port = 443; // WebSockets SSL port
  private updateCount = 0;
  private isConnected = false;
  
  private onTelemetryReceivedCallback: ((telemetry: SyncTelemetry) => void) | null = null;
  private onStatusChangedCallback: ((status: SyncStatus) => void) | null = null;

  constructor() {
    // Load active session state if any is persisted in localStorage
    const savedMode = localStorage.getItem('openanchor_sync_mode');
    if (savedMode) {
      // Note: We don't auto-reconnect on startup to avoid background network noise,
      // but the mode state can be read.
    }
  }

  public getMode(): SyncMode {
    return this.mode;
  }

  public getUpdateCount(): number {
    return this.updateCount;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getTopic(): string {
    return this.topic;
  }

  /**
   * Generates a random session (topic ID and AES-256 key) and creates QR code content
   */
  public async generateSession(): Promise<{ qrText: string; topic: string; keyBase64: string }> {
    this.topic = `openanchor/sync/${crypto.randomUUID()}`;
    
    // Generate AES key for encryption
    this.secretKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // Export to base64
    const rawKey = await crypto.subtle.exportKey('raw', this.secretKey);
    const keyBase64 = this.arrayBufferToBase64(rawKey);

    const qrData = {
      b: this.broker,
      p: this.port,
      t: this.topic,
      k: keyBase64
    };

    const qrText = JSON.stringify(qrData);
    return { qrText, topic: this.topic, keyBase64 };
  }

  /**
   * Helper to generate a Canvas/DataURL for the QR code
   */
  public async generateQrCodeDataUrl(text: string): Promise<string> {
    try {
      return await QRCode.toDataURL(text, {
        margin: 2,
        width: 256,
        color: {
          dark: '#ffffff',     // white on dark background matches our UI
          light: '#0b1325'    // app background color
        }
      });
    } catch (err) {
      console.error('Failed to generate QR Code data URL', err);
      throw err;
    }
  }

  /**
   * Starts Boat Mode (Broadcasting)
   */
  public async startBoatMode(qrJson: string): Promise<void> {
    this.disconnect();
    this.mode = 'boat';
    this.updateCount = 0;
    localStorage.setItem('openanchor_sync_mode', 'boat');

    try {
      const config = JSON.parse(qrJson);
      this.topic = config.t;
      this.broker = config.b;
      this.port = config.p;

      // Import the key
      const keyBuffer = this.base64ToArrayBuffer(config.k);
      this.secretKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        'AES-GCM',
        true,
        ['encrypt', 'decrypt']
      );

      this.notifyStatus('sync_status_connecting_broker', false);
      
      const brokerUrl = `wss://${this.broker}:${this.port}/mqtt`;
      this.client = mqtt.connect(brokerUrl, {
        connectTimeout: 10000,
        reconnectPeriod: 5000
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.notifyStatus('sync_status_connected_boat', false);
      });

      this.client.on('reconnect', () => {
        this.notifyStatus('sync_status_reconnecting', false);
      });

      this.client.on('error', (err) => {
        console.error('MQTT Broker Error (Boat):', err);
        this.notifyStatus('sync_status_broker_error', true, err.message);
      });
      
      this.client.on('close', () => {
        this.isConnected = false;
      });

    } catch (err: any) {
      this.notifyStatus('sync_status_start_error', true, err.message);
      throw err;
    }
  }

  /**
   * Starts Shore Mode (Monitoring) by parsing a scanned QR payload
   */
  public async startShoreMode(qrJson: string): Promise<void> {
    this.disconnect();
    this.mode = 'shore';
    this.updateCount = 0;
    localStorage.setItem('openanchor_sync_mode', 'shore');

    try {
      const config = JSON.parse(qrJson);
      this.topic = config.t;
      this.broker = config.b;
      this.port = config.p;

      // Import the key
      const keyBuffer = this.base64ToArrayBuffer(config.k);
      this.secretKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        'AES-GCM',
        true,
        ['encrypt', 'decrypt']
      );

      this.notifyStatus('sync_status_connecting_broker', false);

      const brokerUrl = `wss://${this.broker}:${this.port}/mqtt`;
      this.client = mqtt.connect(brokerUrl, {
        connectTimeout: 10000,
        reconnectPeriod: 5000
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.notifyStatus('sync_status_connected_shore', false);
        this.client?.subscribe(this.topic, { qos: 1 });
      });

      this.client.on('reconnect', () => {
        this.notifyStatus('sync_status_reconnecting', false);
      });

      this.client.on('error', (err) => {
        console.error('MQTT Broker Error (Shore):', err);
        this.notifyStatus('sync_status_broker_error', true, err.message);
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });

      this.client.on('message', async (topic, message) => {
        if (topic !== this.topic) return;

        try {
          const telemetry = await this.decryptMessage(new Uint8Array(message));
          this.updateCount++;
          this.notifyStatus('sync_status_active_received', false, this.updateCount);
          if (this.onTelemetryReceivedCallback) {
            this.onTelemetryReceivedCallback(telemetry);
          }
        } catch (err) {
          console.error('Failed to decrypt incoming telemetry:', err);
          this.notifyStatus('sync_status_decrypt_error', true);
        }
      });

    } catch (err: any) {
      this.notifyStatus('sync_status_start_error', true, err.message);
      throw err;
    }
  }

  /**
   * Stop all networking activity and reset mode
   */
  public disconnect(): void {
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    this.mode = 'none';
    this.secretKey = null;
    this.topic = '';
    this.isConnected = false;
    this.updateCount = 0;
    localStorage.removeItem('openanchor_sync_mode');
    this.notifyStatus('sync_status_inactive', false);
  }

  /**
   * Encrypts and publishes telemetry from the Boat Phone
   */
  public async broadcast(pos: GPSPosition, gpsEngine: any, currentDistance: number, currentAlarmState: AlarmState): Promise<void> {
    if (this.mode !== 'boat' || !this.client || !this.isConnected || !this.secretKey) {
      return;
    }

    try {
      const payload: SyncTelemetry = {
        timestamp: Date.now(),
        position: {
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
          speed: pos.speed,
          heading: pos.heading
        },
        alarm: {
          isArmed: gpsEngine.getIsArmed(),
          anchor: gpsEngine.getAnchor(),
          alarmRadius: gpsEngine.getAlarmRadius(),
          alarmState: currentAlarmState,
          distance: currentDistance,
          useSectorAlarm: gpsEngine.getUseSectorAlarm(),
          sectorWidth: gpsEngine.getSectorWidth(),
          sectorHeading: gpsEngine.getSectorHeading(),
          isPaused: gpsEngine.getIsPaused()
        }
      };

      const encryptedData = await this.encryptMessage(payload);
      this.client.publish(this.topic, Buffer.from(encryptedData), { qos: 1 });
      this.updateCount++;
      this.notifyStatus('sync_status_active_sent', false, this.updateCount);
    } catch (err) {
      console.error('Failed to broadcast telemetry:', err);
      this.notifyStatus('sync_status_send_error', true);
    }
  }

  /**
   * Register listeners
   */
  public onTelemetryReceived(callback: (telemetry: SyncTelemetry) => void): void {
    this.onTelemetryReceivedCallback = callback;
  }

  public onStatusChanged(callback: (status: SyncStatus) => void): void {
    this.onStatusChangedCallback = callback;
  }

  /* ==========================================================================
     Crypto & Binary Helper Methods
     ========================================================================== */

  private async encryptMessage(payload: SyncTelemetry): Promise<Uint8Array> {
    if (!this.secretKey) throw new Error('Secret key not initialized');

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(payload));
    
    // Generate 12-byte IV for AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.secretKey,
      dataBuffer
    );

    // Combine IV (12 bytes) and ciphertext into single package
    const packet = new Uint8Array(iv.length + ciphertext.byteLength);
    packet.set(iv, 0);
    packet.set(new Uint8Array(ciphertext), iv.length);

    return packet;
  }

  private async decryptMessage(packet: Uint8Array): Promise<SyncTelemetry> {
    if (!this.secretKey) throw new Error('Secret key not initialized');

    const iv = packet.subarray(0, 12);
    const ciphertext = packet.subarray(12);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.secretKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decryptedBuffer);
    return JSON.parse(jsonString) as SyncTelemetry;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return buffer;
  }

  private notifyStatus(key: string, isError: boolean, param?: string | number): void {
    if (this.onStatusChangedCallback) {
      this.onStatusChangedCallback({ key, isError, param });
    }
  }
}

export const syncManager = new SyncManager();
