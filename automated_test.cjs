const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

async function run() {
  console.log("=== STARTING OPENANCHOR AUTOMATED BROWSER TEST ===");
  
  console.log("1. Starting Vite dev server...");
  const devServer = spawn('npx', ['vite'], { cwd: __dirname });
  
  let serverOutput = '';
  devServer.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  
  devServer.stderr.on('data', (data) => {
    console.error("Vite error:", data.toString());
  });

  // Wait 4 seconds for Vite to boot up and bundle
  await new Promise(r => setTimeout(r, 4000));
  console.log("Vite server output:\n", serverOutput);

  const url = 'http://localhost:5173';
  console.log(`2. Launching headless browser and navigating to ${url}...`);

  let browser;
  let exitCode = 0;
  
  try {
    // Attempt to use system chromium if available (best for ARM/x86 host environments), otherwise let puppeteer decide
    const options = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    // Check common paths for system chromium to avoid download architecture mismatches
    const fs = require('fs');
    if (fs.existsSync('/usr/bin/chromium-browser')) {
      options.executablePath = '/usr/bin/chromium-browser';
      console.log("System Chromium-browser detected, using: /usr/bin/chromium-browser");
    } else if (fs.existsSync('/usr/bin/chromium')) {
      options.executablePath = '/usr/bin/chromium';
      console.log("System Chromium detected, using: /usr/bin/chromium");
    }

    browser = await puppeteer.launch(options);
    const page = await browser.newPage();

    let pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[BROWSER CONSOLE ERROR]: ${msg.text()}`);
      } else {
        console.log(`[BROWSER CONSOLE]: ${msg.text()}`);
      }
    });

    page.on('pageerror', (err) => {
      console.error('[BROWSER RUNTIME EXCEPTION]:', err.stack || err.message);
      pageErrors.push(err);
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    console.log("3. Web application page loaded successfully!");

    // Verify critical DOM elements exist and evaluate their height/size calculations
    const elementsState = await page.evaluate(() => {
      const state = {};
      
      const selectLang = document.getElementById('select-language');
      state.selectLang = selectLang ? { id: selectLang.id, tagName: selectLang.tagName, val: selectLang.value } : null;
      
      const btnSettings = document.getElementById('btn-settings');
      state.btnSettings = btnSettings ? { id: btnSettings.id, tagName: btnSettings.tagName } : null;

      const elTabsViewport = document.querySelector('.settings-tabs-viewport');
      state.elTabsViewport = elTabsViewport ? { className: elTabsViewport.className } : null;

      const mapEl = document.getElementById('map');
      state.mapEl = mapEl ? { id: mapEl.id, width: mapEl.offsetWidth, height: mapEl.offsetHeight } : null;

      return state;
    });

    console.log("4. DOM Elements Validation State:\n", JSON.stringify(elementsState, null, 2));

    // Verify map sizing is fully stretched to viewport (resolves top-left black map rendering glitch)
    if (elementsState.mapEl && elementsState.mapEl.height > 100 && elementsState.mapEl.width > 100) {
      console.log("✅ SUCCESS: Leaflet Map Container stretches fully inside ion-content viewport.");
    } else {
      console.warn("⚠️ WARNING: Leaflet Map Container width/height calculation is too small.");
      exitCode = 1;
    }

    // Verify there were no unhandled exceptions during load (resolves unresponsive buttons issue)
    if (pageErrors.length === 0) {
      console.log("✅ SUCCESS: No runtime JavaScript exceptions detected during page load and bootstrap.");
    } else {
      console.error(`❌ FAILURE: ${pageErrors.length} JavaScript runtime exception(s) detected!`);
      exitCode = 1;
    }

    // 5. Test the settings menu and tabs (new settings tests)
    console.log("5. Testing settings menu opening, tab texts, panel visibility, sliding transitions, and closing...");
    
    // Click Settings Button to open settings
    console.log("  - Clicking settings button to open settings menu...");
    await page.click('#btn-settings');
    await new Promise(r => setTimeout(r, 1000)); // Wait for menu slide-in animation

    // Validate that settings menu is open
    const isMenuOpen = await page.evaluate(async () => {
      const menu = document.getElementById('settings-menu');
      if (!menu) return false;
      return typeof menu.isOpen === 'function' ? await menu.isOpen() : true;
    });

    if (isMenuOpen) {
      console.log("  ✅ SUCCESS: Settings Menu opened successfully.");
    } else {
      console.error("  ❌ FAILURE: Settings Menu did not report as open.");
      exitCode = 1;
    }

    // Try to click Sound Test button now that the menu is open to confirm interactive elements work
    console.log("  - Testing click interactions on sound test button inside settings...");
    await page.click('#btn-sound-test');
    await new Promise(r => setTimeout(r, 1000));
    console.log("  ✅ SUCCESS: Sound Test Button click interaction tested successfully.");

    // Verify settings tab text labels exist and are populated
    const tabTexts = await page.evaluate(() => {
      const texts = {};
      const tabGeneral = document.querySelector('#tab-btn-general span');
      const tabDesign = document.querySelector('#tab-btn-design span');
      const tabTracks = document.querySelector('#tab-btn-tracks span');
      
      texts.general = tabGeneral ? tabGeneral.textContent.trim() : null;
      texts.design = tabDesign ? tabDesign.textContent.trim() : null;
      texts.tracks = tabTracks ? tabTracks.textContent.trim() : null;
      return texts;
    });

    console.log("  - Settings Tab labels found:", JSON.stringify(tabTexts));
    
    if (tabTexts.general && tabTexts.design && tabTexts.tracks) {
      console.log("  ✅ SUCCESS: Settings Tab labels are non-empty and visible: " + JSON.stringify(tabTexts));
    } else {
      console.error("  ❌ FAILURE: Settings Tab labels are empty or missing: " + JSON.stringify(tabTexts));
      exitCode = 1;
    }

    // Helper to evaluate panel visibility
    const checkPanelVisibility = async (panelId) => {
      return await page.evaluate((id) => {
        const panel = document.getElementById(id);
        const viewport = document.querySelector('.settings-tabs-viewport');
        if (!panel || !viewport) return { exists: false };
        
        const pRect = panel.getBoundingClientRect();
        const vRect = viewport.getBoundingClientRect();
        
        // Check if panel display is block/flex (not display: none) and lies horizontally within the viewport coordinates
        const isDisplayNone = window.getComputedStyle(panel).display === 'none';
        const isHorizontallyInViewport = (pRect.left >= vRect.left - 5 && pRect.right <= vRect.right + 5);
        
        return {
          exists: true,
          display: window.getComputedStyle(panel).display,
          isDisplayNone,
          isHorizontallyInViewport,
          width: pRect.width,
          height: pRect.height
        };
      }, panelId);
    };

    // Verify Tab 1 (General) panel is initially visible and in viewport
    const panelGeneralStatus = await checkPanelVisibility('tab-panel-general');
    console.log("  - Tab 1 (General) panel status:", JSON.stringify(panelGeneralStatus));
    if (panelGeneralStatus.exists && !panelGeneralStatus.isDisplayNone && panelGeneralStatus.isHorizontallyInViewport) {
      console.log("  ✅ SUCCESS: General panel is laid out and visible in settings viewport.");
    } else {
      console.error("  ❌ FAILURE: General panel is not visible or has wrong layout.");
      exitCode = 1;
    }

    // Click Tab 2 (Design) and verify slide transition
    console.log("  - Clicking Design tab...");
    await page.click('#tab-btn-design');
    await new Promise(r => setTimeout(r, 800)); // wait for slide animation
    
    const panelDesignStatus = await checkPanelVisibility('tab-panel-design');
    console.log("  - Tab 2 (Design) panel status:", JSON.stringify(panelDesignStatus));
    if (panelDesignStatus.exists && !panelDesignStatus.isDisplayNone && panelDesignStatus.isHorizontallyInViewport) {
      console.log("  ✅ SUCCESS: Design settings panel slid in and is now visible.");
    } else {
      console.error("  ❌ FAILURE: Design settings panel did not slide in or is not visible.");
      exitCode = 1;
    }

    // Click Tab 3 (Tracks) and verify slide transition
    console.log("  - Clicking Track tab...");
    await page.click('#tab-btn-tracks');
    await new Promise(r => setTimeout(r, 800)); // wait for slide animation

    const panelTracksStatus = await checkPanelVisibility('tab-panel-tracks');
    console.log("  - Tab 3 (Track) panel status:", JSON.stringify(panelTracksStatus));
    if (panelTracksStatus.exists && !panelTracksStatus.isDisplayNone && panelTracksStatus.isHorizontallyInViewport) {
      console.log("  ✅ SUCCESS: Tracks settings panel slid in and is now visible.");
    } else {
      console.error("  ❌ FAILURE: Tracks settings panel did not slide in or is not visible.");
      exitCode = 1;
    }

    // Click back to Tab 1 (General)
    console.log("  - Clicking General tab to return...");
    await page.click('#tab-btn-general');
    await new Promise(r => setTimeout(r, 800));
    const panelGeneralReturnStatus = await checkPanelVisibility('tab-panel-general');
    if (panelGeneralReturnStatus.isHorizontallyInViewport) {
      console.log("  ✅ SUCCESS: Successfully navigated back to General settings panel.");
    } else {
      console.error("  ❌ FAILURE: General settings panel did not return to viewport.");
      exitCode = 1;
    }

    // Click Close Button
    console.log("  - Clicking settings close button...");
    await page.click('#btn-settings-close');
    await new Promise(r => setTimeout(r, 1000)); // wait for close animation

    const isMenuClosed = await page.evaluate(async () => {
      const menu = document.getElementById('settings-menu');
      if (!menu) return true;
      return typeof menu.isOpen === 'function' ? !(await menu.isOpen()) : true;
    });

    if (isMenuClosed) {
      console.log("  ✅ SUCCESS: Settings Menu closed successfully.");
    } else {
      console.warn("  ⚠️ WARNING: Settings Menu did not report as closed.");
    }

  } catch (err) {
    console.error("❌ TEST EXECUTION ERROR:", err);
    exitCode = 1;
  } finally {
    if (browser) {
      console.log("6. Closing browser...");
      await browser.close();
    }
    console.log("7. Stopping Vite dev server...");
    devServer.kill();
    
    if (exitCode === 0) {
      console.log("=== ✅ ALL AUTOMATED TESTS PASSED SUCCESSFULLY ===");
    } else {
      console.error("=== ❌ AUTOMATED TESTS FAILED ===");
    }
    process.exit(exitCode);
  }
}

run();
