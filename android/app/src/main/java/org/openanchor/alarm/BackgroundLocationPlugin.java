package org.openanchor.alarm;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundLocation")
public class BackgroundLocationPlugin extends Plugin {

    @PluginMethod
    public void startService(PluginCall call) {
        try {
            Context context = getContext();
            
            Double lat = call.getDouble("lat");
            Double lng = call.getDouble("lng");
            Double radius = call.getDouble("radius");
            Boolean useSector = call.getBoolean("useSector", false);
            Double sectorWidth = call.getDouble("sectorWidth", 90.0);
            Double sectorHeading = call.getDouble("sectorHeading", 0.0);

            if (lat == null || lng == null || radius == null) {
                call.reject("Latitude, Longitude and Radius parameters are strictly required!");
                return;
            }

            Intent serviceIntent = new Intent(context, BackgroundGeofenceService.class);
            serviceIntent.putExtra("isArmed", true);
            serviceIntent.putExtra("anchorLat", lat);
            serviceIntent.putExtra("anchorLng", lng);
            serviceIntent.putExtra("alarmRadius", radius);
            serviceIntent.putExtra("useSector", useSector);
            serviceIntent.putExtra("sectorWidth", sectorWidth);
            serviceIntent.putExtra("sectorHeading", sectorHeading);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }

            JSObject ret = new JSObject();
            ret.put("status", "started");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to start Background Location Service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        try {
            Context context = getContext();
            Intent serviceIntent = new Intent(context, BackgroundGeofenceService.class);
            context.stopService(serviceIntent);

            JSObject ret = new JSObject();
            ret.put("status", "stopped");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to stop Background Location Service: " + e.getMessage());
        }
    }
}
