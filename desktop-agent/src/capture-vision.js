/**
 * Vision capture — the FALLBACK path for surfaces with a thin/empty
 * accessibility tree (canvas apps, custom-drawn UIs, remote desktop).
 *
 * Screenshots the focused window and asks Claude (high-resolution vision) what
 * the user is doing, returning the same unified event shape. REAL code: uses
 * ai.describeScreenshot(). Requires ANTHROPIC_API_KEY; returns null offline.
 *
 * Used sparingly — accessibility is always tried first, because continuous
 * screenshotting is costly.
 */

import { describeScreenshot } from '../../server/src/ai.js';

/**
 * @param {Buffer} pngBuffer a screenshot of the focused window
 * @param {string} appHint optional app/window name for context
 * @returns unified FlowLens event, or null if vision is unavailable
 */
export async function captureFromScreenshot(pngBuffer, appHint = '') {
  const desc = await describeScreenshot(pngBuffer, appHint);
  if (!desc) return null;
  return {
    type: 'nav',
    label: desc.activity || 'On-screen activity',
    app: desc.app || appHint || 'unknown',
    windowTitle: appHint,
    source: 'desktop_vision',
    // entities the model spotted (e.g. an invoice number) — help stitching
    hints: Array.isArray(desc.entities) ? desc.entities : [],
    ts: Date.now(),
  };
}
