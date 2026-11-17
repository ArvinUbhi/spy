import { performance } from 'node:perf_hooks';
export function createMetrics() {
  let previousCpu=process.cpuUsage(), previousAt=performance.now(), accepted=0, previousEvents=0;
  let current={service:'spy',protocol:1,pid:process.pid,cpuPercent:0,rssMiB:0,heapMiB:0,eventsPerSecond:0};
  return {
    accepted(count){accepted+=count;},
    sample(){const now=performance.now(),cpu=process.cpuUsage(),elapsed=Math.max(1,now-previousAt),memory=process.memoryUsage();
      current={service:'spy',protocol:1,pid:process.pid,cpuPercent:Math.round(((cpu.user-previousCpu.user)+(cpu.system-previousCpu.system))/1000/elapsed*1000)/10,rssMiB:Math.round(memory.rss/1048576*10)/10,heapMiB:Math.round(memory.heapUsed/1048576*10)/10,eventsPerSecond:Math.round((accepted-previousEvents)/elapsed*1000),uptimeSeconds:Math.floor(process.uptime())};
      previousCpu=cpu;previousAt=now;previousEvents=accepted;return current;},
    get(){return current;}
  };
}
