class BloomFilter {
  private bitArray: Uint8Array;
  private size: number;
  private hashCount: number;

  constructor(expectedElements: number, falsePositiveRate: number) {
    // Calculate optimal bit array size
    this.size = Math.ceil((-expectedElements * Math.log(falsePositiveRate)) / (Math.log(2) * Math.log(2)));
    
    // Calculate optimal number of hash functions
    this.hashCount = Math.ceil((this.size / expectedElements) * Math.log(2));
    
    // Initialize bit array
    this.bitArray = new Uint8Array(Math.ceil(this.size / 8));
  }

  private hash(item: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < item.length; i++) {
      hash = ((hash * 31) + item.charCodeAt(i)) & 0x7fffffff;
    }
    return hash % this.size;
  }

  public add(item: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      const bitIndex = this.hash(item, i);
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;
      
      this.bitArray[byteIndex] |= (1 << bitOffset);
    }
  }

  public test(item: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const bitIndex = this.hash(item, i);
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;
      
      if (!(this.bitArray[byteIndex] & (1 << bitOffset))) {
        return false;
      }
    }
    return true;
  }

  public clear(): void {
    this.bitArray.fill(0);
  }

  public getSize(): number {
    return this.size;
  }

  public getHashCount(): number {
    return this.hashCount;
  }

  public getMemoryUsage(): number {
    return this.bitArray.length;
  }
}

export default BloomFilter;