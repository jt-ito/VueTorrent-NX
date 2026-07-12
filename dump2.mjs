import { chromium } from '@playwright/test';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8080');
  await page.waitForTimeout(2000);
  const html = await page.content();
  console.log(html.substring(html.indexOf('<div class="v-card-actions"'), html.indexOf('<div class="v-card-actions"') + 500));
  await browser.close();
})();
