import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  try {
    await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle0' });
    // Maybe we need to log in? We don't have auth credentials here.
    // Let's just wait a bit.
    await new Promise(r => setTimeout(r, 2000));
  } catch (err) {
    console.error(err);
  }
  
  await browser.close();
})();
