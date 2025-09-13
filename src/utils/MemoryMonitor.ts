class MemoryMonitor {
  private intervalId: number | null = null;
  private callback: ((usage: number) => void) | null = null;

  public startMonitoring(callback: (usage: number) => void, intervalMs: number = 1000): void {
    this.callback = callback;
    
    this.intervalId = window.setInterval(() => {
      const usage = this.getCurrentMemoryUsage();
      callback(usage);
    }, intervalMs);
  }

  public stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.callback = null;
  }

  private getCurrentMemoryUsage(): number {
    try {
      // Use Performance Memory API if available (Chrome/Edge)
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        return memory.usedJSHeapSize / memory.jsHeapSizeLimit;
      }
      
      // Fallback estimation
      return this.estimateMemoryUsage();
    } catch (error) {
      console.warn('Failed to get memory usage:', error);
      return 0;
    }
  }

  private estimateMemoryUsage(): number {
    try {
      // Very rough estimation based on typical browser patterns
      const documentElements = document.getElementsByTagName('*').length;
      const estimatedDOMSize = documentElements * 200; // ~200 bytes per element
      
      // Assume 512MB as typical browser memory limit
      const estimatedLimit = 512 * 1024 * 1024;
      
      return Math.min(0.9, estimatedDOMSize / estimatedLimit);
    } catch {
      return 0.1; // Default low usage if estimation fails
    }
  }

  public static isMemoryAPIAvailable(): boolean {
    return 'memory' in performance;
  }

  public static getMemoryInfo(): any {
    if (MemoryMonitor.isMemoryAPIAvailable()) {
      return (performance as any).memory;
    }
    return null;
  }

  public checkMemoryThreshold(threshold: number): boolean {
    const usage = this.getCurrentMemoryUsage();
    return usage >= threshold;
  }

  public async triggerGC(): Promise<void> {
    // Trigger garbage collection hint
    if ('gc' in window) {
      try {
        (window as any).gc();
      } catch (error) {
        // GC not available, use alternative approach
        await this.alternativeGCHint();
      }
    } else {
      await this.alternativeGCHint();
    }
  }

  private async alternativeGCHint(): Promise<void> {
    // Create and destroy objects to hint at GC
    const objects = [];
    for (let i = 0; i < 1000; i++) {
      objects.push(new Array(1000).fill(0));
    }
    
    // Clear references
    objects.length = 0;
    
    // Yield control to allow GC
    return new Promise(resolve => setTimeout(resolve, 10));
  }
}

export default MemoryMonitor;