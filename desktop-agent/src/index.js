/**
 * FlowLens desktop agent entry point.
 *
 * Real host:   accessibility capture (primary) + vision fallback → emit.
 * This sandbox: `--simulate` replays the simulated cross-app feed through the
 *              real emit path so the whole loop is demonstrable headless.
 *
 *   node desktop-agent/src/index.js --simulate
 */
import { Emitter } from './emit.js';
import { startAccessibilityCapture } from './capture-accessibility.js';

const SIMULATE = process.argv.includes('--simulate');

async function main() {
  if (SIMULATE) {
    // Reuse the simulated feed generator — it writes through ingest directly.
    await import('../../seed/generate-desktop.js');
    console.log('Desktop agent (simulate): replayed the cross-app feed via ingest.');
    return;
  }

  const emitter = new Emitter({
    session: {
      id: `device_${process.env.USER || 'user'}`,
      app: `workstation-${process.env.USER || 'user'}`,
      source: 'desktop_ax',
      startedAt: Date.now(),
    },
  });

  process.on('SIGINT', async () => {
    await emitter.stop();
    process.exit(0);
  });

  try {
    startAccessibilityCapture((event) => emitter.push(event));
    console.log('Desktop agent capturing via accessibility tree…');
  } catch (err) {
    console.error(String(err.message));
    console.error('Run with --simulate to exercise the pipeline on this host.');
    process.exit(1);
  }
}

main();
