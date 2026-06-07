// DDM Phase 4 — screenshot helper for VLM critique input.
//
// Renders an HTML artifact (served at a local URL, or as a file path) to a
// PNG base64 string using Playwright chromium. Called by the critique
// orchestrator after a successful ship event to feed the VLM loop.
//
// Toggle: SCREENSHOT_HELPER=disabled returns a sentinel empty string
// so tests can exercise findings routing without a browser dependency.

const VIEWPORT = { width: 1280, height: 900 };
const TIMEOUT_MS = parseInt(process.env.SCREENSHOT_TIMEOUT_MS ?? '15000', 10);

/** Launch Playwright chromium, render the target, return PNG as base64. */
export async function screenshotForVlm(target: string): Promise<string> {
  if (process.env.SCREENSHOT_HELPER === 'disabled') {
    return '';
  }

  // Dynamic import so the daemon cold-start doesn't pay the playwright init
  // cost unless a critique run actually requests a screenshot.
  // playwright-core is installed as a workspace dev dependency; the type cast
  // avoids a missing-declaration error in the daemon's tsconfig without adding
  // playwright as a daemon runtime dependency.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { chromium } = (await import('playwright-core' as any)) as {
    chromium: {
      launch(opts: { headless: boolean }): Promise<{
        newPage(): Promise<{
          setViewportSize(v: { width: number; height: number }): Promise<void>;
          goto(url: string, opts: { waitUntil: string; timeout: number }): Promise<void>;
          screenshot(opts: { type: string; fullPage: boolean }): Promise<Buffer>;
        }>;
        close(): Promise<void>;
      }>;
    };
  };

  const browser = await chromium.launch({ headless: true });
  let pngBase64: string;
  try {
    const page = await browser.newPage();
    await page.setViewportSize(VIEWPORT);
    if (target.startsWith('http://') || target.startsWith('https://')) {
      await page.goto(target, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    } else {
      await page.goto(`file://${target}`, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    }
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    pngBase64 = buf.toString('base64');
  } finally {
    await browser.close();
  }
  return pngBase64;
}
