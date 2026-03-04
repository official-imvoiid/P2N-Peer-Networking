import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', error => console.error('BROWSER ERROR:', error));
    page.on('requestfailed', request => console.log('FAILED URL:', request.url(), request.failure().errorText));

    console.log('Navigating to http://localhost:5175');
    await page.goto('http://localhost:5175', { waitUntil: 'networkidle' });

    await page.waitForTimeout(3000);
    const content = await page.content();
    console.log("HTML length:", content.length);
    const bodyHtml = await page.innerHTML('body');
    console.log("BODY:", bodyHtml);

    await browser.close();
})();
