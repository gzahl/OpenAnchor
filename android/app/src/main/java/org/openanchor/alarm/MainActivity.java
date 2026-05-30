package org.openanchor.alarm;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Reset WebView rendering layer and force complete layout/redraw pass on resume (e.g., after dismissing
        // a permission dialog) to reliably recover from Android hardware composition layer / GPU context loss (black/blank screen).
        if (this.bridge != null && this.bridge.getWebView() != null) {
            final WebView webView = this.bridge.getWebView();
            webView.postDelayed(new Runnable() {
                @Override
                public void run() {
                    try {
                        // Toggle hardware layer off and back on to force Android to tear down and rebuild the GPU composition textures
                        webView.setLayerType(android.view.View.LAYER_TYPE_SOFTWARE, null);
                        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);
                        
                        // Trigger layout pass and paint refresh
                        webView.requestLayout();
                        webView.invalidate();
                    } catch (Exception e) {
                        // Safeguard against any unexpected native lifecycle state exceptions
                    }
                }
            }, 150);
        }
    }
}
