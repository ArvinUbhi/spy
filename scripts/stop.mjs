import { collectorEndpoint, stopCollector } from '../bridge/lifecycle.mjs';
try {
  const endpoint = collectorEndpoint();
  const pid = await stopCollector({ endpoint });
  console.log(pid ? `Stopped Spy PID ${pid}. You can now replace or delete its folder.` : `No Spy collector is running at ${endpoint}.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
