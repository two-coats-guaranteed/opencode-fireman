import { Job } from "./types";

export function retryNotify(jobs: Job[]): void {
  for (const job of jobs) {
    let attempt = 0;
    while (attempt < 3) {
      try {
        job.run();
        break;
      } catch {
        attempt = attempt + 1;
      }
    }
  }
}
