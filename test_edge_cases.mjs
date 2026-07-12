import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // 1. Log in
  console.log("Logging into VueTorrent...");
  await page.goto('http://127.0.0.1:8080');
  await page.waitForSelector('input[type="text"]');
  await page.type('input[type="text"]', 'admin');
  await page.type('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  
  // Wait for dashboard to load
  await page.waitForSelector('.v-toolbar-title');

  // Set blocklist and turn on picker in localStorage directly to save time navigating the settings menu
  await page.evaluate(() => {
    localStorage.setItem('webuiSettings', JSON.stringify({
      blockedExtensions: ['.srt', '.jpg', '.nfo'],
      predownloadPicker: true
    }));
  });
  await page.reload();
  await page.waitForSelector('.v-toolbar-title');

  console.log("\n=== TEST 1: External Add Silently Filtered ===");
  // Ensure starting clean
  await page.evaluate(async () => {
    await fetch('/api/v2/torrents/delete', {
      method: 'POST',
      body: new URLSearchParams({ hashes: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c', deleteFiles: 'true' })
    });
  });
  await new Promise(r => setTimeout(r, 1000));

  // Simulate Sonarr adding a torrent externally (direct to API, not using Vue UI)
  await page.evaluate(async () => {
    await fetch('/api/v2/torrents/add', {
      method: 'POST',
      body: new URLSearchParams({ urls: 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny' })
    });
  });

  // wait 8 seconds for metadata to resolve and for VueTorrent background loop to silently filter it
  console.log("Waiting 8 seconds for metadata and VueTorrent background processing...");
  await new Promise(r => setTimeout(r, 8000));
  
  // Check if a dialog is open (picker)
  const dialogCount = await page.evaluate(() => document.querySelectorAll('.v-dialog--active').length);
  if (dialogCount > 0) {
    console.error("FAIL: Picker dialog appeared for external add!");
  } else {
    console.log("PASS: No picker dialog for external add.");
  }
  
  // Fetch torrent info via API to see its state and file priorities
  const result = await page.evaluate(async () => {
    const res = await fetch('/api/v2/torrents/info?hashes=dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c');
    const torrents = await res.json();
    if (!torrents || torrents.length === 0) return null;
    const t = torrents[0];
    
    const fileRes = await fetch('/api/v2/torrents/files?hash=dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c');
    const files = await fileRes.json();
    
    return { state: t.state, tags: t.tags, files };
  });

  if (!result) {
    console.error("FAIL: Torrent was deleted or not found!");
  } else {
    if (result.tags.includes('vt-predownload')) {
      console.error("FAIL: Torrent received vt-predownload tag!");
    } else {
      console.log("PASS: Torrent did not receive vt-predownload tag.");
    }
    
    if (result.state === 'pausedDL' || result.state === 'pausedUP') {
      console.error("FAIL: Torrent is paused! It should be downloading.");
    } else {
      console.log(`PASS: Torrent is active (state: ${result.state}).`);
    }

    let fileFilterPassed = true;
    for (const file of result.files) {
      if (file.name.endsWith('.srt') || file.name.endsWith('.jpg')) {
        if (file.priority !== 0) {
          console.error(`FAIL: Blocklisted file ${file.name} has priority ${file.priority} (expected 0)`);
          fileFilterPassed = false;
        }
      }
    }
    if (fileFilterPassed) console.log("PASS: Blocklisted files successfully set to priority 0.");
  }

  // Clean up
  await page.evaluate(async () => {
    await fetch('/api/v2/torrents/delete', {
      method: 'POST',
      body: new URLSearchParams({ hashes: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c', deleteFiles: 'true' })
    });
  });


  console.log("\n=== TEST 2: API Key Fallback ===");
  await page.evaluate(() => {
    localStorage.setItem('webuiSettings', JSON.stringify({
      apiKey: 'invalidkey',
      blockedExtensions: ['.srt', '.jpg', '.mp4'],
      predownloadPicker: true
    }));
  });
  await page.reload();
  
  // Wait to see if it redirects back to login or hangs
  await new Promise(r => setTimeout(r, 3000));
  
  const loginInputs = await page.evaluate(() => document.querySelectorAll('input[type="text"]').length);
  const isDashboard = await page.evaluate(() => document.querySelector('.v-toolbar-title') !== null);
  
  if (loginInputs > 0) {
    console.log("PASS: Gracefully fell back to login screen with invalid API key.");
  } else if (isDashboard) {
    console.log("PASS: Used existing session cookie despite invalid API key.");
  } else {
    console.error("FAIL: Hung on blank screen or error state!");
  }

  console.log("\nAll tests completed.");
  await browser.close();
})();
