import Papa from 'papaparse';
import * as Comlink from 'comlink';
import WorkerPool from '../workers/WorkerPool';
import BloomFilter from '../utils/BloomFilter';
import LRUCache from '../utils/LRUCache';
import { saveAs } from '../utils/FileSaver';
import * as pako from 'pako';

export interface ColumnMapping {
  emailColumn: string;
  firstNameColumn: string;
  lastNameColumn: string;
  splitNameColumn: boolean;
  groupsColumn?: string;
}

export interface DuplicateResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  sourceFile: string;
  confidence: number;
  rowIndex: number;
  clientTypeVipStatus?: string;
  clientTypeProspects?: string;
}

export interface ProcessingProgress {
  progress: number;
  currentFile: string;
  rowsProcessed: number;
  duplicatesFound: number;
  estimatedTimeRemaining: number;
}

export interface PerformanceMetrics {
  rowsPerSecond: number;
  memoryUsage: number;
  workerUtilization: number;
  totalProcessingTime: number;
}

export class CSVDuplicateDetector {
  private workerPool: WorkerPool;
  private emailIndex: Map<string, any[]> = new Map();
  private bloomFilter: BloomFilter;
  private cache: LRUCache<string, any>;
  private originalBasisFile: File | null = null;
  private currentColumnMapping: ColumnMapping | null = null;
  private basisFileClientTypes: Map<string, string> = new Map();
  private basisFileClientProspects: Map<string, string> = new Map();
  private isProcessing = false;
  private isPaused = false;
  private startTime = 0;
  private pauseTime = 0;
  private totalPauseTime = 0;

  // Callbacks
  public onProgress: ((progress: ProcessingProgress) => void) | null = null;
  public onPerformanceUpdate: ((metrics: PerformanceMetrics) => void) | null = null;
  public onResults: ((results: DuplicateResult[]) => void) | null = null;
  public onError: ((error: string) => void) | null = null;

  // Performance tracking
  private rowsProcessed = 0;
  private totalRows = 0;
  private allDuplicates: DuplicateResult[] = [];
  private performanceInterval: number | null = null;

  constructor() {
    const workerCount = Math.min(8, Math.max(2, navigator.hardwareConcurrency || 4));
    this.workerPool = new WorkerPool(workerCount);
    this.bloomFilter = new BloomFilter(100000, 0.01);
    this.cache = new LRUCache(10000);
    
    this.startPerformanceMonitoring();
  }

  private startPerformanceMonitoring() {
    this.performanceInterval = window.setInterval(() => {
      if (!this.isProcessing) return;

      const currentTime = Date.now();
      const elapsed = (currentTime - this.startTime - this.totalPauseTime) / 1000;
      const rowsPerSecond = elapsed > 0 ? this.rowsProcessed / elapsed : 0;
      
      const remaining = this.totalRows - this.rowsProcessed;
      const estimatedTimeRemaining = rowsPerSecond > 0 ? Math.ceil(remaining / rowsPerSecond) : 0;

      // Memory usage estimation
      const memoryUsage = this.estimateMemoryUsage();
      
      // Worker utilization
      const workerUtilization = this.workerPool.getUtilization();

      if (this.onPerformanceUpdate) {
        this.onPerformanceUpdate({
          rowsPerSecond,
          memoryUsage,
          workerUtilization,
          totalProcessingTime: elapsed * 1000
        });
      }

      if (this.onProgress) {
        const progress = this.totalRows > 0 ? (this.rowsProcessed / this.totalRows) * 100 : 0;
        this.onProgress({
          progress,
          currentFile: '', // Will be set by file processing
          rowsProcessed: this.rowsProcessed,
          duplicatesFound: this.allDuplicates.length,
          estimatedTimeRemaining
        });
      }
    }, 1000);
  }

  private estimateMemoryUsage(): number {
    try {
      // Use performance.memory if available
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        return memory.usedJSHeapSize / memory.jsHeapSizeLimit;
      }
      
      // Fallback estimation based on data structures
      const indexSize = this.emailIndex.size * 200; // Rough estimate
      const cacheSize = this.cache.size() * 100;
      const estimatedTotal = indexSize + cacheSize;
      
      // Very rough estimate assuming 1GB typical browser limit
      return Math.min(1, estimatedTotal / (1024 * 1024 * 1024));
    } catch (error) {
      return 0;
    }
  }

  public async processFiles(basisFile: File, comparisonFiles: File[], defaultColumnMapping: ColumnMapping): Promise<void> {
    console.log('🔧 CSVDuplicateDetector.processFiles started');
    console.log('Files to process:', { 
      basisFile: basisFile.name, 
      comparisonFiles: comparisonFiles.map(f => f.name),
      defaultColumnMapping 
    });
    
    if (this.isProcessing) {
      console.error('❌ Already processing files');
      throw new Error('Already processing files');
    }

    try {
      this.isProcessing = true;
      this.startTime = Date.now();
      this.totalPauseTime = 0;
      this.rowsProcessed = 0;
      this.allDuplicates = [];
      this.totalRows = this.estimateTotalRows([basisFile, ...comparisonFiles]);
      
      // Store original basis file and column mapping for export
      this.originalBasisFile = basisFile;
      this.currentColumnMapping = defaultColumnMapping;

      console.log('📈 Estimated total rows:', this.totalRows);

      // Reset data structures
      this.emailIndex.clear();
      this.basisFileClientTypes.clear();
      this.basisFileClientProspects.clear();
      this.bloomFilter = new BloomFilter(100000, 0.01);
      this.cache.clear();
      console.log('🧹 Data structures reset');

      // Process basis file first
      console.log('📁 Processing basis file:', basisFile.name);
      const basisColumnMapping = this.getEffectiveColumnMapping(basisFile.name, defaultColumnMapping);
      console.log('📋 Basis file column mapping:', basisColumnMapping);
      await this.processBasisFile(basisFile, basisColumnMapping);
      console.log('✅ Basis file processed. Email index size:', this.emailIndex.size);

      // Process comparison files
      for (let i = 0; i < comparisonFiles.length; i++) {
        if (!this.isProcessing) break; // Check if stopped
        
        console.log(`📁 Processing comparison file ${i + 1}/${comparisonFiles.length}:`, comparisonFiles[i].name);
        const comparisonColumnMapping = this.getEffectiveColumnMapping(comparisonFiles[i].name, defaultColumnMapping);
        console.log(`📋 Comparison file ${i + 1} column mapping:`, comparisonColumnMapping);
        await this.processComparisonFile(comparisonFiles[i], i, comparisonColumnMapping);
        console.log(`✅ Comparison file ${i + 1} processed. Total duplicates found so far:`, this.duplicatesFound);
        
        // Trigger garbage collection hint every few files
        if (i % 3 === 0) {
          await this.gcHint();
        }
      }

      console.log('🎉 All files processed successfully');
      this.isProcessing = false;
      
    } catch (error) {
      console.error('❌ Error in processFiles:', error);
      this.isProcessing = false;
      if (this.onError) {
        this.onError(error instanceof Error ? error.message : 'Processing failed');
      }
      throw error;
    }
  }

  private getEffectiveColumnMapping(fileName: string, defaultMapping: ColumnMapping): ColumnMapping {
    // Built-in mappings for specific files
    const lowerFileName = fileName.toLowerCase();
    
    if (lowerFileName.includes('contacts_rows') || lowerFileName.includes('contacts-rows')) {
      // Basis file: contacts_rows.csv has separate firstname/lastname columns
      return {
        emailColumn: 'email',
        firstNameColumn: 'firstname',
        lastNameColumn: 'lastname',
        splitNameColumn: false
      };
    }
    
    if (lowerFileName.includes('ccm') && lowerFileName.includes('contact')) {
      // CCM Contacts file has combined Name column
      return {
        emailColumn: 'email',
        firstNameColumn: 'Name',
        lastNameColumn: 'Name',
        splitNameColumn: true,
        groupsColumn: 'Groups'
      };
    }
    
    if (lowerFileName.includes('jungo') && lowerFileName.includes('contact')) {
      // Jungo Contact Database has separate firstname/lastname columns
      return {
        emailColumn: 'email',
        firstNameColumn: 'firstname',
        lastNameColumn: 'lastname',
        splitNameColumn: false,
        groupsColumn: 'Group c'
      };
    }
    
    // For any other file, use the default mapping
    return defaultMapping;
  }

  private estimateTotalRows(files: File[]): number {
    // Rough estimation: 100 bytes per row on average
    return files.reduce((total, file) => total + Math.floor(file.size / 100), 0);
  }

  private async processBasisFile(file: File, fileColumnMapping: ColumnMapping): Promise<void> {
    console.log('🏗️ Building email index from basis file:', file.name);
    console.log('📋 Using column mapping:', fileColumnMapping);
    const chunks = this.streamCSV(file, 15000);
    let chunkCount = 0;
    
    for await (const chunk of chunks) {
      if (!this.isProcessing) break;
      
      await this.waitIfPaused();
      
      chunkCount++;
      console.log(`📦 Processing basis chunk ${chunkCount}, size:`, chunk.length);
      
      // Build email index from chunk
      await this.buildIndexFromChunk(chunk, file.name, fileColumnMapping);
      
      this.rowsProcessed += chunk.length;
      console.log('📊 Basis file progress - rows processed:', this.rowsProcessed, 'index size:', this.emailIndex.size);
    }
    
    console.log('✅ Basis file processing complete. Total chunks:', chunkCount, 'Final index size:', this.emailIndex.size);
  }

  private async processComparisonFile(file: File, fileIndex: number, fileColumnMapping: ColumnMapping): Promise<void> {
    console.log('🔍 Finding duplicates in comparison file:', file.name);
    console.log('📋 Using column mapping:', fileColumnMapping);
    const chunks = this.streamCSV(file, 10000);
    let chunkCount = 0;
    
    for await (const chunk of chunks) {
      if (!this.isProcessing) break;
      
      await this.waitIfPaused();
      
      chunkCount++;
      console.log(`📦 Processing comparison chunk ${chunkCount}, size:`, chunk.length);
      
      // Find duplicates in chunk
      const chunkDuplicates = await this.findDuplicatesInChunk(chunk, file.name, fileColumnMapping);
      console.log(`🔍 Found ${chunkDuplicates.length} duplicates in chunk ${chunkCount}`);
      this.allDuplicates.push(...chunkDuplicates);
      
      // Store client types for basis file emails that were found as duplicates
      for (const duplicate of chunkDuplicates) {
        if (duplicate.clientTypeVipStatus) {
          // Find the corresponding basis file email from the index
          const basisRecords = this.emailIndex.get(duplicate.email);
          if (basisRecords) {
            for (const basisRecord of basisRecords) {
              if (basisRecord.sourceFile !== file.name) { // This is the basis file record
                this.basisFileClientTypes.set(basisRecord.email, duplicate.clientTypeVipStatus);
                console.log(`📝 Stored client type "${duplicate.clientTypeVipStatus}" for basis email: ${basisRecord.email}`);
                break; // Only need to store once per email
              }
            }
          }
        }
        
        if (duplicate.clientTypeProspects) {
          // Find the corresponding basis file email from the index
          const basisRecords = this.emailIndex.get(duplicate.email);
          if (basisRecords) {
            for (const basisRecord of basisRecords) {
              if (basisRecord.sourceFile !== file.name) { // This is the basis file record
                this.basisFileClientProspects.set(basisRecord.email, duplicate.clientTypeProspects);
                console.log(`📝 Stored client prospects "${duplicate.clientTypeProspects}" for basis email: ${basisRecord.email}`);
                break; // Only need to store once per email
              }
            }
          }
        }
      }
      
      this.rowsProcessed += chunk.length;
      
      // Emit results incrementally
      if (this.onResults && this.allDuplicates.length > 0) {
        console.log('📤 Emitting', this.allDuplicates.length, 'results to UI');
        this.onResults([...this.allDuplicates]);
      }
    }
    
    console.log('✅ Comparison file processing complete. Total chunks:', chunkCount);
  }

  private async *streamCSV(file: File, chunkSize: number): AsyncGenerator<any[]> {
    console.log('📄 Starting CSV streaming for:', file.name, 'chunk size:', chunkSize);
    
    let fileToProcess = file;
    
    // Handle .gz files by decompressing them first
    if (file.name.toLowerCase().endsWith('.gz')) {
      console.log('🗜️ Detected .gz file, decompressing...');
      try {
        const arrayBuffer = await file.arrayBuffer();
        const compressed = new Uint8Array(arrayBuffer);
        const decompressed = pako.ungzip(compressed, { to: 'string' });
        
        // Create a new File object from the decompressed content
        const blob = new Blob([decompressed], { type: 'text/csv' });
        fileToProcess = new File([blob], file.name.replace('.gz', ''), { type: 'text/csv' });
        console.log('✅ Decompression complete, original size:', file.size, 'decompressed size:', fileToProcess.size);
      } catch (error) {
        console.error('❌ Failed to decompress .gz file:', error);
        throw new Error('Failed to decompress .gz file: ' + error.message);
      }
    }
    
    let queue: any[] = [];
    let isParsingComplete = false;
    let resolveNextChunk: (() => void) | null = null;
    let parseError: Error | null = null;
    let totalRowsParsed = 0;

    // Start parsing the file
    Papa.parse(fileToProcess, {
      header: true,
      skipEmptyLines: true,
      chunk: (results) => {
        console.log('📥 CSV chunk received, rows:', results.data.length, 'errors:', results.errors.length);
        if (results.errors.length > 0) {
          console.warn('⚠️ CSV parsing errors:', results.errors);
        }
        
        // Add new data to queue
        queue.push(...results.data);
        totalRowsParsed += results.data.length;
        
        // Signal that new data is available
        if (resolveNextChunk) {
          resolveNextChunk();
          resolveNextChunk = null;
        }
      },
      complete: () => {
        console.log('✅ CSV parsing complete for:', file.name, 'Total rows parsed:', totalRowsParsed);
        isParsingComplete = true;
        
        // Signal completion
        if (resolveNextChunk) {
          resolveNextChunk();
          resolveNextChunk = null;
        }
      },
      error: (error) => {
        console.error('❌ CSV parsing error for:', file.name, error);
        parseError = error;
        isParsingComplete = true;
        
        // Signal error
        if (resolveNextChunk) {
          resolveNextChunk();
          resolveNextChunk = null;
        }
      }
    });

    let chunksYielded = 0;
    // Process chunks as they become available
    while (!isParsingComplete || queue.length > 0) {
      // Check for parsing errors
      if (parseError) {
        console.error('❌ Throwing parse error:', parseError);
        throw parseError;
      }

      // If we have enough data for a chunk, yield it
      if (queue.length >= chunkSize) {
        const chunk = queue.splice(0, chunkSize);
        chunksYielded++;
        console.log(`📦 Yielding chunk ${chunksYielded}, size:`, chunk.length, 'Queue remaining:', queue.length);
        yield chunk;
        continue;
      }

      // If parsing is complete, yield remaining data
      if (isParsingComplete && queue.length > 0) {
        const chunk = queue.splice(0);
        chunksYielded++;
        console.log(`📦 Yielding final chunk ${chunksYielded}, size:`, chunk.length);
        yield chunk;
        break;
      }

      // If parsing is complete and no data left, we're done
      if (isParsingComplete && queue.length === 0) {
        console.log('✅ CSV streaming complete for:', fileToProcess.name, 'Total chunks yielded:', chunksYielded);
        break;
      }

      // Wait for more data
      await new Promise<void>((resolve) => {
        resolveNextChunk = resolve;
      });
    }
  }
  private async buildIndexFromChunk(chunk: any[], sourceFile: string, fileColumnMapping: ColumnMapping): Promise<void> {
    console.log('🏗️ Building index from chunk, size:', chunk.length);
    const worker = await this.workerPool.getWorker();
    console.log('👷 Got worker for index building');
    
    try {
      const result = await worker.buildEmailIndex(chunk, sourceFile, fileColumnMapping);
      console.log('📊 Worker returned index with', Object.keys(result).length, 'unique emails');
      
      // Merge results into main index
      let newEmails = 0;
      for (const [email, records] of Object.entries(result)) {
        if (!this.emailIndex.has(email)) {
          this.emailIndex.set(email, []);
          newEmails++;
        }
        this.emailIndex.get(email)!.push(...(records as any[]));
        
        // Add to bloom filter
        this.bloomFilter.add(email);
      }
      console.log('📈 Added', newEmails, 'new emails to index. Total index size:', this.emailIndex.size);
    } finally {
      this.workerPool.releaseWorker(worker);
      console.log('👷 Released worker');
    }
  }

  private async findDuplicatesInChunk(chunk: any[], sourceFile: string, fileColumnMapping: ColumnMapping): Promise<DuplicateResult[]> {
    console.log('🔍 Finding duplicates in chunk, size:', chunk.length);
    const worker = await this.workerPool.getWorker();
    console.log('👷 Got worker for duplicate detection');
    
    try {
      // Pre-filter with bloom filter
      const candidateEmails = chunk
        .map(row => this.normalizeEmail(row[fileColumnMapping.emailColumn]))
        .filter(email => email && this.bloomFilter.test(email));
      
      console.log('🎯 Bloom filter candidates:', candidateEmails.length, 'out of', chunk.length, 'rows');
      
      if (candidateEmails.length === 0) {
        console.log('⚠️ No candidates found, returning empty results');
        return [];
      }

      const result = await worker.findDuplicates(chunk, this.getIndexSubset(candidateEmails), sourceFile, fileColumnMapping);
      console.log('🎯 Worker found', result.length, 'duplicates');
      return result;
    } finally {
      this.workerPool.releaseWorker(worker);
      console.log('👷 Released worker');
    }
  }

  private getIndexSubset(emails: string[]): Record<string, any[]> {
    const subset: Record<string, any[]> = {};
    for (const email of emails) {
      const records = this.emailIndex.get(email);
      if (records) {
        subset[email] = records;
      }
    }
    return subset;
  }

  private normalizeEmail(email: any): string {
    if (!email) return '';
    return String(email).toLowerCase().trim();
  }

  private async waitIfPaused(): Promise<void> {
    if (this.isPaused) {
      this.pauseTime = Date.now();
      
      return new Promise((resolve) => {
        const checkPause = () => {
          if (!this.isPaused) {
            this.totalPauseTime += Date.now() - this.pauseTime;
            resolve();
          } else {
            setTimeout(checkPause, 100);
          }
        };
        checkPause();
      });
    }
  }

  private async gcHint(): Promise<void> {
    // Request garbage collection hint
    return new Promise(resolve => setTimeout(resolve, 10));
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  public stop(): void {
    this.isProcessing = false;
    this.isPaused = false;
  }

  public async exportModifiedBasisFile(): Promise<void> {
    if (!this.originalBasisFile || !this.currentColumnMapping) {
      throw new Error('No basis file or column mapping available for export');
    }
    
    try {
      console.log('📤 Starting export of modified basis file...');
      console.log('📊 Client types collected:', this.basisFileClientTypes.size);
      
      // Parse the original basis file
      const basisData = await this.parseBasisFileForExport();
      console.log('📄 Parsed basis file, rows:', basisData.length);
      
      // Add client_type_vip_status column to each row
      const modifiedData = this.addClientTypeColumn(basisData);
      console.log('✅ Added client type column to all rows');
      
      // Convert to CSV format
      const csvData = this.convertModifiedDataToCSV(modifiedData);
      
      // Compress with gzip
      const compressed = pako.gzip(csvData);
      
      // Create blob and download
      const blob = new Blob([compressed], { type: 'application/gzip' });
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      saveAs(blob, `contacts_rows_with_client_types_${timestamp}.csv.gz`);
      
      console.log('✅ Modified basis file exported successfully');
      
    } catch (error) {
      console.error('❌ Export failed:', error);
      throw new Error('Failed to export modified basis file: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
  
  private async parseBasisFileForExport(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      
      Papa.parse(this.originalBasisFile!, {
        header: true,
        skipEmptyLines: true,
        chunk: (chunk) => {
          results.push(...chunk.data);
        },
        complete: () => {
          console.log('✅ CSV parsing complete for:', fileToProcess.name, 'Total rows parsed:', totalRowsParsed);
        },
        error: (error) => {
          console.error('❌ CSV parsing error for:', fileToProcess.name, error);
        }
      });
    });
  }
  
  private addClientTypeColumn(basisData: any[]): any[] {
    const emailColumn = this.currentColumnMapping!.emailColumn;
    
    return basisData.map(row => {
      const email = this.normalizeEmail(row[emailColumn]);
      const clientType = this.basisFileClientTypes.get(email) || '';
      const clientProspects = this.basisFileClientProspects.get(email) || '';
      
      return {
        ...row,
        client_type_vip_status: clientType,
        client_type_prospects: clientProspects
      };
    });
  }
  
  private convertModifiedDataToCSV(data: any[]): string {
    if (data.length === 0) return '';
    
    // Get all column names from the first row
    const headers = Object.keys(data[0]);
    
    // Create CSV content
    const csvRows = [
      headers, // Header row
      ...data.map(row => headers.map(header => row[header] || ''))
    ];
    
    return csvRows.map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
  }

  public async exportDuplicateResults(results: DuplicateResult[]): Promise<void> {
    try {
      // Convert to CSV format
      const csvData = this.convertDuplicatesToCSV(results);
      
      // Compress with gzip
      const compressed = pako.gzip(csvData);
      
      // Create blob and download
      const blob = new Blob([compressed], { type: 'application/gzip' });
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      saveAs(blob, `duplicates_${timestamp}.csv.gz`);
      
    } catch (error) {
      throw new Error('Failed to export duplicate results: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  private convertDuplicatesToCSV(results: DuplicateResult[]): string {
    const headers = ['Email', 'First Name', 'Last Name', 'Source File', 'Confidence', 'Row Index', 'Client Type / VIP Status', 'Client Type / Prospects'];
    const rows = results.map(result => [
      result.email,
      result.firstName,
      result.lastName,
      result.sourceFile,
      result.confidence.toFixed(3),
      result.rowIndex,
      result.clientTypeVipStatus || '',
      result.clientTypeProspects || ''
    ]);
    
    return [headers, ...rows].map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
  }

  public cleanup(): void {
    this.stop();
    
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
      this.performanceInterval = null;
    }
    
    this.workerPool.terminate();
    this.emailIndex.clear();
    this.basisFileClientTypes.clear();
    this.basisFileClientProspects.clear();
    this.cache.clear();
  }
}