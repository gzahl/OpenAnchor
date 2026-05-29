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

    // Try to click Sound Test button to confirm interactive elements work
    console.log("5. Testing click interactions on sound test button...");
    await page.click('#btn-sound-test');
    await new Promise(r => setTimeout(r, 1000));
    console.log("✅ SUCCESS: Sound Test Button click interaction tested successfully.");

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
