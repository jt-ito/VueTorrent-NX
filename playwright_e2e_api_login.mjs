import { chromium } from '@playwright/test';

(async () => {
  console.log("Launching Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Authenticating via API...");
  // Use page.request to get the SID cookie
  const response = await context.request.post('http://127.0.0.1:8080/api/v2/auth/login', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: 'username=admin&password=admin123'
  });
  const text = await response.text();
  console.log(`Login response: ${text}`);

  if (text !== 'Ok.') {
    console.error("Auth failed");
    await browser.close();
    return;
  }

  // The context automatically captures the SID cookie!
  
  console.log("Navigating to VueTorrent...");
  await page.goto('http://127.0.0.1:8080');
  
  await page.waitForSelector('.v-toolbar-title', { timeout: 10000 });
  console.log("Logged in successfully.");

  // Clear existing torrents
  await page.evaluate(async () => {
    await fetch('/api/v2/torrents/delete', {
      method: 'POST',
      body: new URLSearchParams({ hashes: 'all', deleteFiles: 'true' })
    });
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log("Starting TEST 1: Concurrent Add via UI...");
  const page2 = await context.newPage();
  await page2.goto('http://127.0.0.1:8080');
  await page2.waitForSelector('.v-toolbar-title');

  // Trigger Add dialog on Page 1
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerHTML.includes('mdi-plus'));
    if (btn) btn.click();
  });
  
  // Trigger Add dialog on Page 2
  await page2.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerHTML.includes('mdi-plus'));
    if (btn) btn.click();
  });

  await page.waitForSelector('input[type="file"]');
  await page2.waitForSelector('textarea');

  await page.setInputFiles('input[type="file"]', 'ubuntu.torrent');
  await page2.fill('textarea', 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny');

  console.log("Submitting both simultaneously...");
  
  const p1Submit = page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('.v-dialog button')).find(b => b.innerText.includes('Add Torrents') || b.innerText.includes('Add torrents'));
    if (submitBtn) submitBtn.click();
  });
  const p2Submit = page2.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('.v-dialog button')).find(b => b.innerText.includes('Add Torrents') || b.innerText.includes('Add torrents'));
    if (submitBtn) submitBtn.click();
  });

  await Promise.all([p1Submit, p2Submit]);

  console.log("Waiting for pickers...");
  
  let p1Title = "";
  try {
    await page.waitForSelector('.v-dialog--active', { timeout: 10000 });
    p1Title = await page.evaluate(() => document.querySelector('.v-dialog--active .v-card-title')?.innerText || '');
  } catch(e) { console.error("No picker on page 1"); }

  let p2Title = "";
  try {
    await page2.waitForSelector('.v-dialog--active', { timeout: 10000 });
    p2Title = await page2.evaluate(() => document.querySelector('.v-dialog--active .v-card-title')?.innerText || '');
  } catch(e) { console.error("No picker on page 2"); }

  console.log(`Tab 1 Picker Title: ${p1Title}`);
  console.log(`Tab 2 Picker Title: ${p2Title}`);

  if (p2Title.includes('Big Buck Bunny') && p1Title.includes('ubuntu')) {
    console.log("PASS: Both pickers attributed to their correct hashes via real UI concurrently.");
  } else {
    console.error("FAIL: Pickers did not open correctly or hashes got crossed.");
  }

  console.log("\n=== TEST 2: Orphan Sweep Reload Test ===");
  console.log("Picker for Big Buck Bunny is open on Tab 2. Reloading Tab 2...");
  await page2.reload();
  await page2.waitForSelector('.v-toolbar-title');
  
  console.log("Waiting 10 seconds to check if sweep deletes it...");
  await new Promise(r => setTimeout(r, 10000));
  
  const tList = await page2.evaluate(() => document.body.innerText);
  if (tList.includes('Big Buck Bunny')) {
    console.log("PASS: Torrent was NOT deleted by the sweep immediately after reload, protected by age threshold.");
  } else {
    console.error("FAIL: Torrent was swept immediately after reloading!");
  }

  console.log("\nAll E2E tests finished.");
  await browser.close();
})();
