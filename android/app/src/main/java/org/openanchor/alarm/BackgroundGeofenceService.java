package org.openanchor.alarm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import androidx.core.app.NotificationCompat;

public class BackgroundGeofenceService extends Service implements LocationListener {
    private static final String TAG = "OpenAnchorBackgroundGPS";
    private static final String CHANNEL_ID = "OpenAnchorLocationChannel";
    private static final int NOTIFICATION_ID = 8829;
    private static final int ALARM_NOTIFICATION_ID = 8830;

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;
    private NotificationManager notificationManager;
    
    // Alarm components
    private Ringtone alarmRingtone;
    private Vibrator vibrator;
    private boolean isAlarmActive = false;

    // Config variables
    private boolean isArmed = false;
    private double anchorLat = 0;
    private double anchorLng = 0;
    private double alarmRadius = 30;
    private boolean useSector = false;
    private double sectorWidth = 90;
    private double sectorHeading = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Background Service onCreate");
        
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        
        // Setup WakeLock to keep CPU active during sleep states
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OpenAnchor:BackgroundLocationLock");
        wakeLock.acquire();

        // Create Notification Channel for Android Oreo+
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Background Service onStartCommand");

        if (intent != null) {
            // Load and update active settings
            isArmed = intent.getBooleanExtra("isArmed", true);
            anchorLat = intent.getDoubleExtra("anchorLat", 0);
            anchorLng = intent.getDoubleExtra("anchorLng", 0);
            alarmRadius = intent.getDoubleExtra("alarmRadius", 30);
            useSector = intent.getBooleanExtra("useSector", false);
            sectorWidth = intent.getDoubleExtra("sectorWidth", 90);
            sectorHeading = intent.getDoubleExtra("sectorHeading", 0);
            
            // Persist parameters in SharedPreferences for recovery
            saveParams();
        } else {
            // Service was killed and restarted, recover parameters from storage
            loadParams();
        }

        // Start Foreground with persistent notification
        startForeground(NOTIFICATION_ID, buildStatusNotification("GPS-Suche läuft..."));

        // Register for Location updates FOSS style (GPS provider)
        registerLocationUpdates();

        return START_STICKY;
    }

    private void registerLocationUpdates() {
        try {
            if (locationManager != null) {
                // Request updates every 5 seconds or 1 meter change
                if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    locationManager.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        5000, // 5 seconds
                        1.0f,  // 1 meter
                        this
                    );
                    Log.d(TAG, "Registered GPS Location Updates successfully");
                } else {
                    // Fallback to Network Provider if GPS is disabled
                    locationManager.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER,
                        5000,
                        1.0f,
                        this
                    );
                    Log.d(TAG, "GPS Provider disabled, fallback to Network Provider registered");
                }
            }
        } catch (SecurityException e) {
            Log.e(TAG, "Security Exception: Location Permissions missing! ", e);
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null) return;
        
        Log.d(TAG, "GPS Update: Lat=" + location.getLatitude() + ", Lng=" + location.getLongitude() + ", Acc=" + location.getAccuracy());

        // Discard coordinates with abysmal accuracy (> 35m) to avoid false alarms
        if (location.getAccuracy() > 35) {
            Log.w(TAG, "Discarding background GPS update due to poor accuracy: ±" + location.getAccuracy() + "m");
            return;
        }

        // Trigger Broadcast to MainActivity if active
        sendLocationBroadcast(location);

        if (!isArmed || anchorLat == 0 || anchorLng == 0) {
            stopAlarm();
            return;
        }

        // Calculate geographical Haversine distance to anchor
        double distance = calculateHaversine(location.getLatitude(), location.getLongitude(), anchorLat, anchorLng);
        Log.d(TAG, "Distance to Anchor: " + distance + "m, Radius limit: " + alarmRadius + "m");

        // Update persistent active watch notification with live distance
        notificationManager.notify(NOTIFICATION_ID, buildStatusNotification("Entfernung zum Anker: " + Math.round(distance) + "m"));

        boolean breached = false;

        // 1. Check circle radius breach
        if (distance >= alarmRadius) {
            breached = true;
        }

        // 2. Check sector cone alarm breach if enabled
        if (!breached && useSector && distance > 2.5) {
            double bearing = calculateBearing(anchorLat, anchorLng, location.getLatitude(), location.getLongitude());
            double diff = ((bearing - sectorHeading + 180) % 360 + 360) % 360 - 180;
            if (Math.abs(diff) > sectorWidth / 2) {
                breached = true;
            }
        }

        if (breached) {
            triggerAlarm(distance);
        } else {
            stopAlarm();
        }
    }

    private void triggerAlarm(double distance) {
        if (isAlarmActive) {
            // Keep updating the alarm notification with live distance
            notificationManager.notify(ALARM_NOTIFICATION_ID, buildAlarmNotification(distance));
            return; 
        }

        Log.e(TAG, "ANCHOR ALARM BREACHED! Boat is drifting!");
        isAlarmActive = true;

        // Post high-priority alert notification
        notificationManager.notify(ALARM_NOTIFICATION_ID, buildAlarmNotification(distance));

        // 1. Play Native loud siren ringtone (alarm type)
        try {
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }
            alarmRingtone = RingtoneManager.getRingtone(getApplicationContext(), alarmUri);
            if (alarmRingtone != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    AudioAttributes aa = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build();
                    alarmRingtone.setAudioAttributes(aa);
                }
                alarmRingtone.play();
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start native alarm ringtone: ", e);
        }

        // 2. Vibrate recursively in active search & rescue pulse pattern
        try {
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = {0, 800, 400, 800, 400}; // vibrate 800ms, pause 400ms
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0)); // loop from index 0
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to initiate native vibrations: ", e);
        }
    }

    private void stopAlarm() {
        if (!isAlarmActive) return;
        
        Log.d(TAG, "Silencing native background alarms");
        isAlarmActive = false;

        // Dismiss alarm notification
        notificationManager.cancel(ALARM_NOTIFICATION_ID);

        // Stop ringtone
        if (alarmRingtone != null && alarmRingtone.isPlaying()) {
            alarmRingtone.stop();
        }

        // Stop vibrator
        if (vibrator != null) {
            vibrator.cancel();
        }
    }

    private void sendLocationBroadcast(Location location) {
        Intent intent = new Intent("org.openanchor.alarm.LOCATION_UPDATE");
        intent.putExtra("lat", location.getLatitude());
        intent.putExtra("lng", location.getLongitude());
        intent.putExtra("accuracy", location.getAccuracy());
        intent.putExtra("speed", location.getSpeed());
        intent.putExtra("heading", location.getBearing());
        intent.putExtra("time", location.getTime());
        sendBroadcast(intent);
    }

    private Notification buildStatusNotification(String text) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 
            0, 
            notificationIntent, 
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("OpenAnchor Wache Aktiv")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private Notification buildAlarmNotification(double distance) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 
            0, 
            notificationIntent, 
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🚨 ANKERALARM! 🚨")
            .setContentText("Das Boot treibt ab! Entfernung: " + Math.round(distance) + "m!")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setFullScreenIntent(pendingIntent, true) // launch activity immediately
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                CHANNEL_ID,
                "OpenAnchor Background Service Channel",
                NotificationManager.IMPORTANCE_LOW
            );
            serviceChannel.setDescription("Monitors geographical location and active boundaries in the background.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }

    private void saveParams() {
        SharedPreferences prefs = getSharedPreferences("OpenAnchorPrefs", MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putBoolean("isArmed", isArmed);
        editor.putFloat("anchorLat", (float) anchorLat);
        editor.putFloat("anchorLng", (float) anchorLng);
        editor.putFloat("alarmRadius", (float) alarmRadius);
        editor.putBoolean("useSector", useSector);
        editor.putFloat("sectorWidth", (float) sectorWidth);
        editor.putFloat("sectorHeading", (float) sectorHeading);
        editor.apply();
    }

    private void loadParams() {
        SharedPreferences prefs = getSharedPreferences("OpenAnchorPrefs", MODE_PRIVATE);
        isArmed = prefs.getBoolean("isArmed", false);
        anchorLat = prefs.getFloat("anchorLat", 0);
        anchorLng = prefs.getFloat("anchorLng", 0);
        alarmRadius = prefs.getFloat("alarmRadius", 30);
        useSector = prefs.getBoolean("useSector", false);
        sectorWidth = prefs.getFloat("sectorWidth", 90);
        sectorHeading = prefs.getFloat("sectorHeading", 0);
    }

    // Geolocation mathematical helper formulas
    private double calculateHaversine(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371e3; // Earth's radius in meters
        double phi1 = lat1 * Math.PI / 180;
        double phi2 = lat2 * Math.PI / 180;
        double deltaPhi = (lat2 - lat1) * Math.PI / 180;
        double deltaLambda = (lon2 - lon1) * Math.PI / 180;

        double a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
                  
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private double calculateBearing(double lat1, double lon1, double lat2, double lon2) {
        double phi1 = lat1 * Math.PI / 180;
        double phi2 = lat2 * Math.PI / 180;
        double dLon = (lon2 - lon1) * Math.PI / 180;

        double y = Math.sin(dLon) * Math.cos(phi2);
        double x = Math.cos(phi1) * Math.sin(phi2) -
                  Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
                  
        double brng = Math.atan2(y, x) * 180 / Math.PI;
        return (brng + 360) % 360;
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "Background Service onDestroy");
        stopAlarm();
        
        if (locationManager != null) {
            locationManager.removeUpdates(this);
        }
        
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // Start service as foreground/sticky, no binding needed
    }

    // Interface location callback methods (empty stubs required for Android SDK support)
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
}
