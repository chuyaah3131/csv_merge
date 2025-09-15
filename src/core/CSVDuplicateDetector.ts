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

export interface ProcessingSummary {
  phase1: {
    initialBasisEmails: number;
    duplicatesFound: number;
    filesProcessed: number;
  };
  phase2: {
    duplicatesFound: number;
    filesProcessed: number;
  };
  phase3: {
    emailsFiltered: number;
    domainsFiltered: string[];
  };
  final: {
    totalDuplicatesFound: number;
    finalBasisEmails: number;
    totalFilesProcessed: number;
  };
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

  // Phase tracking
  private currentPhase: 'phase1' | 'phase2' | 'phase3' = 'phase1';
  private phase1DuplicatesCount = 0;
  private phase2DuplicatesCount = 0;
  private phase3FilteredCount = 0;
  private initialUniqueBasisEmails = 0;
  private phase1FilesProcessed = 0;
  private phase2FilesProcessed = 0;
  private filteredDomains: string[] = [];
  private phase3LogMessages: string[] = [];
  // Callbacks
  public onProgress: ((progress: ProcessingProgress) => void) | null = null;
  public onPerformanceUpdate: ((metrics: PerformanceMetrics) => void) | null = null;
  public onResults: ((results: DuplicateResult[]) => void) | null = null;

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
      this.totalRows = this.estimateTotalRows([basisFile, ...comparisonFiles]);
      
      // Store original basis file and column mapping for export
      this.originalBasisFile = basisFile;
      this.currentColumnMapping = defaultColumnMapping;

      console.log('📈 Estimated total rows:', this.totalRows);

      // Only reset data structures if starting Phase 1
      if (this.currentPhase === 'phase1') {
        this.allDuplicates = [];
        this.emailIndex.clear();
        this.basisFileClientTypes.clear();
        this.basisFileClientProspects.clear();
        this.bloomFilter = new BloomFilter(100000, 0.01);
        this.cache.clear();
        this.phase1DuplicatesCount = 0;
        this.phase2DuplicatesCount = 0;
        this.phase3FilteredCount = 0;
        this.initialUniqueBasisEmails = 0;
        this.phase1FilesProcessed = 0;
        this.phase2FilesProcessed = 0;
        console.log('🧹 Data structures reset for Phase 1');
      }

      // Process basis file first (only in Phase 1)
      if (this.currentPhase === 'phase1') {
        console.log('📁 Processing basis file:', basisFile.name);
        const basisColumnMapping = this.getEffectiveColumnMapping(basisFile.name, defaultColumnMapping);
        console.log('📋 Basis file column mapping:', basisColumnMapping);
        await this.processBasisFile(basisFile, basisColumnMapping);
        this.initialUniqueBasisEmails = this.emailIndex.size;
        console.log('✅ Basis file processed. Email index size:', this.emailIndex.size);
      }

      // Track duplicates count before processing
      const duplicatesBeforeProcessing = this.allDuplicates.length;

      // Process comparison files
      for (let i = 0; i < comparisonFiles.length; i++) {
        if (!this.isProcessing) break; // Check if stopped
        
        console.log(`📁 Processing comparison file ${i + 1}/${comparisonFiles.length}:`, comparisonFiles[i].name);
        const comparisonColumnMapping = this.getEffectiveColumnMapping(comparisonFiles[i].name, defaultColumnMapping);
        console.log(`📋 Comparison file ${i + 1} column mapping:`, comparisonColumnMapping);
        await this.processComparisonFile(comparisonFiles[i], i, comparisonColumnMapping);
        console.log(`✅ Comparison file ${i + 1} processed. Total duplicates found so far:`, this.allDuplicates.length);
        
        // Trigger garbage collection hint every few files
        if (i % 3 === 0) {
          await this.gcHint();
        }
      }

      // Track phase-specific duplicate counts
      const duplicatesFoundInThisPhase = this.allDuplicates.length - duplicatesBeforeProcessing;
      if (this.currentPhase === 'phase1') {
        this.phase1DuplicatesCount = duplicatesFoundInThisPhase;
        this.phase1FilesProcessed = comparisonFiles.length;
      } else if (this.currentPhase === 'phase2') {
        this.phase2DuplicatesCount = duplicatesFoundInThisPhase;
        this.phase2FilesProcessed = comparisonFiles.length;
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

  public setPhase(phase: 'phase1' | 'phase2' | 'phase3'): void {
    this.currentPhase = phase;
    console.log('🔄 Phase set to:', phase);
  }

  public applyPhase3Filtering(domainsToFilter: string[]): number {
    console.log('🗑️ Starting Phase 3 filtering for domains:', domainsToFilter);
    this.phase3LogMessages = []; // Clear previous logs
    this.filteredDomains = [...domainsToFilter];

    // Normalize domains for comparison
    const normalizedDomains = domainsToFilter.map(domain => domain.toLowerCase().trim());
    console.log('🔍 Normalized domains for filtering:', normalizedDomains);

    return this.filterModifiedBasisFile(normalizedDomains);
  }

  private async filterModifiedBasisFile(normalizedDomains: string[]): Promise<number> {
    try {
      this.phase3LogMessages.push('📄 Step 1: Getting modified basis file data...');
      
      // Get the complete modified basis file data (original + client type columns)
      const originalBasisData = await this.parseBasisFileForExport();
      const modifiedBasisData = this.addClientTypeColumn(originalBasisData);
      
      this.phase3LogMessages.push(`📊 Original modified basis file rows: ${modifiedBasisData.length}`);
      this.phase3LogMessages.push(`🎯 Domains to filter: ${normalizedDomains.join(', ')}`);
      this.phase3LogMessages.push(`📋 Email column being used: "${this.currentColumnMapping!.emailColumn}"`);
      
      // Filter the modified basis data by email domain
      const emailColumn = this.currentColumnMapping!.emailColumn;
      const removedEmails: string[] = [];
      let processedCount = 0;
      let debugRowCount = 0;
      const maxDebugRows = 50; // Limit detailed logging to first 50 rows
      let emailsClearedCount = 0;
      
      this.phase3LogMessages.push('🔍 Step 2: Clearing email addresses that match filtered domains...');
      
      for (const row of modifiedBasisData) {
        processedCount++;
        const email = this.normalizeEmail(row[emailColumn]);
        
        if (email) {
          const emailParts = email.split('@');
          const emailDomain = emailParts.length > 1 ? emailParts[1] : '';
          
          // Show detailed logging for first few rows
          if (debugRowCount < maxDebugRows) {
            this.phase3LogMessages.push(`📧 Row ${processedCount}: email="${email}", domain="${emailDomain}"`);
          }
          
          if (emailDomain && normalizedDomains.includes(emailDomain.toLowerCase())) {
            this.phase3LogMessages.push(`🧹 CLEARING: ${email} (domain: ${emailDomain})`);
            removedEmails.push(email);
            // Clear the email address but keep the row
            row[emailColumn] = '';
            emailsClearedCount++;
          } else {
            if (debugRowCount < maxDebugRows) {
              this.phase3LogMessages.push(`✅ KEEPING: ${email} (domain: ${emailDomain})`);
            }
          }
          
          if (debugRowCount < maxDebugRows) {
            debugRowCount++;
          }
        } else {
          // Keep rows without valid emails
          if (debugRowCount < maxDebugRows) {
            this.phase3LogMessages.push(`⚠️ Row ${processedCount}: No valid email found, row unchanged`);
          }
        }
        
        // Progress updates every 1000 rows
        if (processedCount % 1000 === 0) {
          this.phase3LogMessages.push(`📊 Progress: ${processedCount}/${modifiedBasisData.length} rows processed, ${emailsClearedCount} emails cleared so far`);
        }
      }
      
      // Store the final filtered data for export
      this.finalFilteredBasisData = [...modifiedBasisData];
      
      this.phase3LogMessages.push(`📊 FILTERING COMPLETE: Cleared ${emailsClearedCount} email addresses from basis file`);
      this.phase3LogMessages.push(`📊 Total basis file rows (unchanged): ${modifiedBasisData.length}`);
      this.phase3LogMessages.push(`📊 Rows with cleared emails: ${emailsClearedCount}`);
      
      if (removedEmails.length > 0) {
        this.phase3LogMessages.push(`🧹 Sample cleared emails: ${removedEmails.slice(0, 10).join(', ')}${removedEmails.length > 10 ? '...' : ''}`);
      }
      
      // Step 3: Rebuild email index from modified basis data (excluding cleared emails)
      this.phase3LogMessages.push('🏗️ Step 3: Rebuilding email index from modified basis data (excluding cleared emails)...');
      this.emailIndex.clear();
      this.basisFileClientTypes.clear();
      this.basisFileClientProspects.clear();
      
      let validEmailsInIndex = 0;
      for (let i = 0; i < modifiedBasisData.length; i++) {
        const row = modifiedBasisData[i];
        const email = this.normalizeEmail(row[emailColumn]);
        
        // Only add to index if email is not empty (not cleared)
        if (email && email.trim() !== '') {
          validEmailsInIndex++;
          let firstName, lastName;
          
          if (this.currentColumnMapping!.splitNameColumn && 
              this.currentColumnMapping!.firstNameColumn === this.currentColumnMapping!.lastNameColumn) {
            // Split the combined name column
            const fullName = (row[this.currentColumnMapping!.firstNameColumn] || '').trim();
            const spaceIndex = fullName.indexOf(' ');
            
            if (spaceIndex > 0) {
              firstName = fullName.substring(0, spaceIndex);
              lastName = fullName.substring(spaceIndex + 1);
            } else {
              firstName = fullName;
              lastName = '';
            }
          } else {
            // Use separate columns
            firstName = row[this.currentColumnMapping!.firstNameColumn] || '';
            lastName = row[this.currentColumnMapping!.lastNameColumn] || '';
          }
          
          if (!this.emailIndex.has(email)) {
            this.emailIndex.set(email, []);
          }
          
          this.emailIndex.get(email)!.push({
            email: email,
            firstName: firstName,
            lastName: lastName,
            sourceFile: this.originalBasisFile!.name,
            rowIndex: i,
            originalRow: row
          });
          
          // Store client types if available
          if (row.client_type_vip_status) {
            this.basisFileClientTypes.set(email, row.client_type_vip_status);
          }
          if (row.client_type_prospects) {
            this.basisFileClientProspects.set(email, row.client_type_prospects);
          }
          
          // Add to bloom filter
          this.bloomFilter.add(email);
        }
      }
      
      this.phase3LogMessages.push(`✅ Email index rebuilt. Size: ${this.emailIndex.size} (from ${validEmailsInIndex} valid emails)`);
      
      // Step 4: Filter duplicates to maintain consistency
      this.phase3LogMessages.push('🔍 Step 4: Filtering duplicates to maintain consistency...');
      const originalDuplicatesCount = this.allDuplicates.length;
      
      this.allDuplicates = this.allDuplicates.filter(duplicate => {
        // Keep duplicates only if their email still exists in the filtered basis
        const keepDuplicate = this.emailIndex.has(duplicate.email);
        
        if (!keepDuplicate) {
          this.phase3LogMessages.push(`🧹 Removing duplicate (email was cleared from basis): ${duplicate.email}`);
        }
        
        return keepDuplicate;
      });
      
      const duplicatesRemoved = originalDuplicatesCount - this.allDuplicates.length;
      this.phase3LogMessages.push(`📊 Removed ${duplicatesRemoved} duplicates (emails were cleared from basis)`);
      
      // Update phase 3 count
      this.phase3FilteredCount = emailsClearedCount;
      
      this.phase3LogMessages.push(`✅ Phase 3 filtering complete. Cleared ${emailsClearedCount} email addresses and removed ${duplicatesRemoved} duplicates`);
      this.phase3LogMessages.push(`📊 Final duplicates count: ${this.allDuplicates.length}`);
      this.phase3LogMessages.push(`📊 Final email index size: ${this.emailIndex.size}`);
      
      // Emit updated results
      if (this.onResults) {
        this.onResults([...this.allDuplicates]);
      }
      
      return emailsClearedCount;
      
    } catch (error) {
      this.phase3LogMessages.push(`❌ Error in Phase 3 filtering: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error('Phase 3 filtering failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  public getCurrentDuplicates(): DuplicateResult[] {
    return [...this.allDuplicates];
  }

  public getProcessingSummary(): ProcessingSummary {
    return {
      phase1: {
        initialBasisEmails: this.initialUniqueBasisEmails,
        duplicatesFound: this.phase1DuplicatesCount,
        filesProcessed: this.phase1FilesProcessed
      },
      phase2: {
        duplicatesFound: this.phase2DuplicatesCount,
        filesProcessed: this.phase2FilesProcessed
      },
      phase3: {
        emailsFiltered: this.phase3FilteredCount,
        domainsFiltered: this.filteredDomains
      },
      final: {
        totalDuplicatesFound: this.allDuplicates.length,
        finalBasisEmails: this.emailIndex.size,
        totalFilesProcessed: this.phase1FilesProcessed + this.phase2FilesProcessed
      }
    };
  }
  public async exportModifiedBasisFile(): Promise<void> {
    if (!this.originalBasisFile || !this.currentColumnMapping) {
      throw new Error('No basis file or column mapping available for export');
    }
    
    try {
      console.log('📤 Starting export of modified basis file...');
      
      // Get the modified CSV content
      const csvData = await this._getModifiedBasisFileContent();
      
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

  public async exportFinalModifiedBasisFile(): Promise<void> {
    if (this.finalFilteredBasisData.length === 0) {
      throw new Error('No final filtered basis data available for export. Please complete Phase 3 first.');
    }
    
    try {
      console.log('📤 Starting export of final modified basis file...');
      
      // Convert filtered data to CSV format
      const csvData = this.convertModifiedDataToCSV(this.finalFilteredBasisData);
      
      // Compress with gzip
      const compressed = pako.gzip(csvData);
      
      // Create blob and download
      const blob = new Blob([compressed], { type: 'application/gzip' });
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      saveAs(blob, `final_contacts_rows_filtered_${timestamp}.csv.gz`);
      
      console.log('✅ Final modified basis file exported successfully');
      
    } catch (error) {
      console.error('❌ Final export failed:', error);
      throw new Error('Failed to export final modified basis file: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
  
  private async _getModifiedBasisFileContent(): Promise<string> {
    console.log('📊 Client types collected:', this.basisFileClientTypes.size);
    
    // Parse the original basis file
    const basisData = await this.parseBasisFileForExport();
    console.log('📄 Parsed basis file, rows:', basisData.length);
    
    // Add client_type_vip_status column to each row
    const modifiedData = this.addClientTypeColumn(basisData);
    console.log('✅ Added client type column to all rows');
    
    // Convert to CSV format
    return this.convertModifiedDataToCSV(modifiedData);
  }
  
  public async getModifiedBasisFileForPhase2(): Promise<File | null> {
    if (!this.originalBasisFile || !this.currentColumnMapping) {
      console.warn('⚠️ No basis file or column mapping available for Phase 2');
      return null;
    }
    
    try {
      console.log('🔄 Creating modified basis file for Phase 2...');
      
      // Get the modified CSV content
      const csvData = await this._getModifiedBasisFileContent();
      
      // Create a new File object from the CSV content
      const blob = new Blob([csvData], { type: 'text/csv' });
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const fileName = `contacts_rows_with_client_types_${timestamp}.csv`;
      
      const modifiedFile = new File([blob], fileName, { type: 'text/csv' });
      console.log('✅ Modified basis file created for Phase 2:', fileName);
      
      return modifiedFile;
      
    } catch (error) {
      console.error('❌ Failed to create modified basis file for Phase 2:', error);
      return null;
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
          resolve(results);
        },
        error: (error) => {
          reject(error);
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
      
      // Update existing columns or add new ones
      const updatedRow = { ...row };
      
      // Update client_type_vip_status column (existing or new)
      if (clientType) {
        updatedRow.client_type_vip_status = clientType;
      } else if (!updatedRow.hasOwnProperty('client_type_vip_status')) {
        updatedRow.client_type_vip_status = '';
      }
      
      // Update client_type_prospects column (existing or new)
      if (clientProspects) {
        updatedRow.client_type_prospects = clientProspects;
      } else if (!updatedRow.hasOwnProperty('client_type_prospects')) {
        updatedRow.client_type_prospects = '';
      }
      
      return updatedRow;
    });
  }
  
  public async exportPhase3Logs(): Promise<void> {
    try {
      if (this.phase3LogMessages.length === 0) {
        throw new Error('No Phase 3 logs available. Please run Phase 3 first.');
      }
      
      console.log('📤 Starting export of Phase 3 logs...');
      
      // Create log content with timestamp header
      const timestamp = new Date().toISOString();
      const logContent = [
        `Phase 3 Processing Log - Generated: ${timestamp}`,
        '='.repeat(60),
        '',
        ...this.phase3LogMessages,
        '',
        '='.repeat(60),
        `Log completed at: ${new Date().toISOString()}`
      ].join('\n');
      
      // Create blob and download
      const blob = new Blob([logContent], { type: 'text/plain' });
      const logTimestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      saveAs(blob, `phase3_processing_log_${logTimestamp}.txt`);
      
      console.log('✅ Phase 3 logs exported successfully');
      
    } catch (error) {
      console.error('❌ Phase 3 log export failed:', error);
      throw new Error('Failed to export Phase 3 logs: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
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