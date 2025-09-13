import * as Comlink from 'comlink';

interface ColumnMapping {
  emailColumn: string;
  firstNameColumn: string;
  lastNameColumn: string;
}

interface WorkerInterface {
  buildEmailIndex: (chunk: any[], sourceFile: string, columnMapping: ColumnMapping) => Promise<Record<string, any[]>>;
  findDuplicates: (chunk: any[], emailIndex: Record<string, any[]>, sourceFile: string, columnMapping: ColumnMapping) => Promise<any[]>;
}

class WorkerPool {
  private workers: Array<{ worker: Worker; proxy: Comlink.Remote<WorkerInterface>; busy: boolean }> = [];
  private queue: Array<{ resolve: (worker: Comlink.Remote<WorkerInterface>) => void; reject: (error: Error) => void }> = [];

  constructor(workerCount: number) {
    this.initializeWorkers(workerCount);
  }

  private async initializeWorkers(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      try {
        const worker = new Worker(new URL('./csvWorker.js', import.meta.url), { type: 'module' });
        const proxy = Comlink.wrap<WorkerInterface>(worker);
        
        this.workers.push({
          worker,
          proxy,
          busy: false
        });
      } catch (error) {
        console.warn(`Failed to create worker ${i}:`, error);
      }
    }
  }

  public async getWorker(): Promise<Comlink.Remote<WorkerInterface>> {
    return new Promise((resolve, reject) => {
      // Find available worker
      const availableWorker = this.workers.find(w => !w.busy);
      
      if (availableWorker) {
        availableWorker.busy = true;
        resolve(availableWorker.proxy);
      } else {
        // Queue the request
        this.queue.push({ resolve, reject });
      }
    });
  }

  public releaseWorker(workerProxy: Comlink.Remote<WorkerInterface>): void {
    // Find the worker and mark as not busy
    const workerItem = this.workers.find(w => w.proxy === workerProxy);
    if (workerItem) {
      workerItem.busy = false;
      
      // Process queue if any
      if (this.queue.length > 0) {
        const { resolve } = this.queue.shift()!;
        workerItem.busy = true;
        resolve(workerItem.proxy);
      }
    }
  }

  public getUtilization(): number {
    if (this.workers.length === 0) return 0;
    const busyWorkers = this.workers.filter(w => w.busy).length;
    return busyWorkers / this.workers.length;
  }

  public terminate(): void {
    this.workers.forEach(({ worker }) => {
      worker.terminate();
    });
    this.workers = [];
    
    // Reject any queued requests
    this.queue.forEach(({ reject }) => {
      reject(new Error('Worker pool terminated'));
    });
    this.queue = [];
  }
}

export default WorkerPool;