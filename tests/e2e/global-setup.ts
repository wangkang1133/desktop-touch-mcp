/**
 * global-setup.ts — vitest `globalSetup` for the e2e project (runs ONCE in the
 * main process, before any worker, and once on teardown).
 *
 * Clears any stale `.e2e-stop` emergency-stop sentinel at the start of a run (so a
 * leftover file from a crashed/aborted run never silently skips a fresh one) and
 * again on teardown. The stop itself is requested with `npm run e2e:stop` from any
 * terminal — that drops the sentinel, and abort-check.ts then skips every
 * remaining test at the next boundary. A terminal command (not a clickable window)
 * is deliberate: it works even while a test is driving the cursor via SendInput
 * (when a STOP button would be unclickable), and it adds no on-screen window that
 * could perturb screenshot / window-enumeration / focus tests.
 */
import { clearStop } from "./helpers/stop-sentinel.js";

export default function setup(): () => void {
  clearStop(); // drop any stale sentinel from a prior run
  return () => clearStop();
}
