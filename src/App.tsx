import React, { useState, useRef, useCallback } from 'react';
import { FileUploader } from './components/FileUploader';
import { ResultsTable } from './components/ResultsTable';
import { ProgressTracker } from './components/ProgressTracker';
import { PerformanceMonitor } from './components/PerformanceMonitor';
import { CSVDuplicateDetector, DuplicateResult, ProcessingState, PerformanceMetrics, ColumnMapping } from './core/CSVDuplicateDetector';
import { Play, CheckCircle, ArrowRight } from 'lucide-react';

type AppPhase = 'initial' | 'processing_phase1' | 'phase1_done' | 'setup_phase2' | 'processing_phase2' | 'phase2_done' | 'processing_phase3' | 'phase3_done';

function App() {
  // Phase management
  const [currentAppPhase, setCurrentAppPhase] = useState<AppPhase>('initial');
  
  // Phase 1 files
  const [phase1BasisFile, setPhase1BasisFile] = useState<File | null>(null);
  const [phase1ComparisonFiles, setPhase1ComparisonFiles] = useState<File[]>([]);
  
  // Phase 2 files
  const [phase2BasisFile, setPhase2BasisFile] = useState<File | null>(null);
  const [phase2ComparisonFiles, setPhase2ComparisonFiles] = useState<File[]>([]);
  
  // Modified basis file from Phase 1
  const [modifiedPhase1BasisFile, setModifiedPhase1BasisFile] = useState<File | null>(null);
  
  // Phase 3 report
  const [phase3Report, setPhase3Report] = useState<any>(null);
  
  // Column mapping
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    emailColumn: 'email',
    firstNameColumn: 'firstname',
    lastNameColumn: 'lastname',
    splitNameColumn: false,
    groupsColumn: 'Groups'
  });
  
  // Processing state
  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    isPaused: false,
    currentFile: '',
    progress: 0,
    rowsProcessed: 0,
    duplicatesFound: 0,
    estimatedTimeRemaining: 0
  });
  
  const [results, setResults] = useState<DuplicateResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [phase3DebugMessages, setPhase3DebugMessages] = useState<string[]>([]);
  const [phase3DebugMessages, setPhase3DebugMessages] = useState<string[]>([]);
  
  const detectorRef = useRef<CSVDuplicateDetector | null>(null);

  // Initialize detector
  React.useEffect(() => {
    detectorRef.current = new CSVDuplicateDetector();
    
    // Set up callbacks
    if (detectorRef.current) {
      detectorRef.current.onProgress = (progress) => {
        setProcessingState(prev => ({ ...prev, ...progress }));
      };
      
      detectorRef.current.onPerformanceUpdate = (metrics) => {
        setPerformanceMetrics(metrics);
      };
      
      detectorRef.current.onResults = (newResults) => {
        setResults(newResults);
      };
      
      detectorRef.current.onError = (errorMessage) => {
        setError(errorMessage);
      };
      
      detectorRef.current.onPhase3Debug = (message) => {
        setPhase3DebugMessages(prev => [...prev, message]);
      };
      
      detectorRef.current.onPhase3Debug = (message) => {
        setPhase3DebugMessages(prev => [...prev, message]);
      };
    }
  }, []);

  // Phase 1 handlers
  const handleStartProcessing = useCallback(async () => {
    if (!phase1BasisFile || phase1ComparisonFiles.length === 0 || !detectorRef.current) return;
    
    detectorRef.current.setPhase('phase1');
    setCurrentAppPhase('processing_phase1');
    setError(null);
    setResults([]);
    
    try {
      await detectorRef.current.processFiles(phase1BasisFile, phase1ComparisonFiles, columnMapping);
      setCurrentAppPhase('phase1_done');
      
      // Generate modified basis file for Phase 2
      const modifiedFile = await detectorRef.current.getModifiedBasisFileForPhase2();
      if (modifiedFile) {
        setModifiedPhase1BasisFile(modifiedFile);
        console.log('✅ Modified basis file prepared for Phase 2:', modifiedFile.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setCurrentAppPhase('initial');
    }
  }, [phase1BasisFile, phase1ComparisonFiles, columnMapping]);

  // Phase 2 handlers
  const handleStartPhase2Setup = useCallback(() => {
    setResults([]);
    
    // Automatically use the modified basis file from Phase 1 if available
    if (modifiedPhase1BasisFile) {
      setPhase2BasisFile(modifiedPhase1BasisFile);
      console.log('🔄 Using modified basis file from Phase 1 for Phase 2');
    }
    
    setCurrentAppPhase('setup_phase2');
  }, [modifiedPhase1BasisFile]);

  const handleStartPhase2Processing = useCallback(async () => {
    if (!phase2BasisFile || phase2ComparisonFiles.length === 0 || !detectorRef.current) return;
    
    detectorRef.current.setPhase('phase2');
    setCurrentAppPhase('processing_phase2');
    setError(null);
    setResults([]);
    
    try {
      await detectorRef.current.processFiles(phase2BasisFile, phase2ComparisonFiles, columnMapping);
      
      setCurrentAppPhase('phase2_done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setCurrentAppPhase('setup_phase2');
    }
  }, [phase2BasisFile, phase2ComparisonFiles, columnMapping]);

  const handleStartPhase3Processing = useCallback(async () => {
    if (!detectorRef.current) return;
    
    setCurrentAppPhase('processing_phase3');
    setError(null);
    setPhase3DebugMessages([]); // Clear previous debug messages
    setPhase3DebugMessages([]); // Clear previous debug messages
    
    try {
      // Define domains to filter
      const domainsToFilter = [
        'ccm.com',
        'myccmortgage.com',
        'change.com',
        'commercemtg.com',
        'commercehomemortgage.com'
      ];
      
      console.log('🗑️ Starting Phase 3 filtering for domains:', domainsToFilter);
      
      // Apply filtering
      const filteredCount = detectorRef.current.applyPhase3Filtering(domainsToFilter);
      
      // Get updated results
      const updatedResults = detectorRef.current.getCurrentDuplicates();
      setResults(updatedResults);
      
      // Generate final report
      const summary = detectorRef.current.getProcessingSummary();
      setPhase3Report(summary);
      
      console.log('✅ Phase 3 complete. Filtered', filteredCount, 'emails');
      console.log('📊 Final summary:', summary);
      
      setCurrentAppPhase('phase3_done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Phase 3 filtering failed');
      setCurrentAppPhase('phase2_done');
    }
  }, []);

  const handleDownloadModifiedBasisFile = useCallback(async () => {
    if (!detectorRef.current) return;
    
    try {
      await detectorRef.current.exportModifiedBasisFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download modified basis file');
    }
  }, []);

  const handleDownloadFinalModifiedBasisFile = useCallback(async () => {
    if (!detectorRef.current) return;
    
    try {
      await detectorRef.current.exportFinalModifiedBasisFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download final modified basis file');
    }
  }, []);

  const canStartPhase1 = phase1BasisFile && phase1ComparisonFiles.length > 0;
  const canStartPhase2 = phase2BasisFile && phase2ComparisonFiles.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            CSV Duplicate Detector
          </h1>
          <p className="text-lg text-gray-600">
            Advanced duplicate detection with memory optimization and performance monitoring
          </p>
        </div>

        {/* Phase Status Panel */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 ${
                ['initial', 'processing_phase1', 'phase1_done', 'setup_phase2', 'processing_phase2', 'phase2_done', 'processing_phase3', 'phase3_done'].includes(currentAppPhase) 
                  ? 'text-blue-600' 
                  : 'text-gray-400'
              }`}>
                <div className={`w-3 h-3 rounded-full ${
                  currentAppPhase === 'phase1_done' 
                    ? 'bg-green-500' 
                    : ['initial', 'processing_phase1'].includes(currentAppPhase)
                      ? 'bg-blue-500'
                      : 'bg-gray-300'
                }`} />
                <span className="font-medium">Phase 1</span>
                {currentAppPhase === 'phase1_done' && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>
              
              <ArrowRight className="w-4 h-4 text-gray-400" />
              
              <div className={`flex items-center space-x-2 ${
                ['setup_phase2', 'processing_phase2', 'phase2_done', 'processing_phase3', 'phase3_done'].includes(currentAppPhase)
                  ? 'text-blue-600'
                  : 'text-gray-400'
              }`}>
                <div className={`w-3 h-3 rounded-full ${
                  currentAppPhase === 'phase2_done'
                    ? 'bg-green-500'
                    : ['setup_phase2', 'processing_phase2'].includes(currentAppPhase)
                      ? 'bg-blue-500'
                      : 'bg-gray-300'
                }`} />
                <span className="font-medium">Phase 2</span>
                {currentAppPhase === 'phase2_done' && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>
              
              <ArrowRight className="w-4 h-4 text-gray-400" />
              
              <div className={`flex items-center space-x-2 ${
                ['processing_phase3', 'phase3_done'].includes(currentAppPhase)
                  ? 'text-blue-600'
                  : 'text-gray-400'
              }`}>
                <div className={`w-3 h-3 rounded-full ${
                  currentAppPhase === 'phase3_done'
                    ? 'bg-green-500'
                    : currentAppPhase === 'processing_phase3'
                      ? 'bg-blue-500'
                      : 'bg-gray-300'
                }`} />
                <span className="font-medium">Phase 3</span>
                {currentAppPhase === 'phase3_done' && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>
            </div>
            
            <div className="text-sm text-gray-500">
              {currentAppPhase === 'initial' && 'Ready to start Phase 1'}
              {currentAppPhase === 'processing_phase1' && 'Processing Phase 1...'}
              {currentAppPhase === 'phase1_done' && 'Phase 1 Complete'}
              {currentAppPhase === 'setup_phase2' && 'Setting up Phase 2'}
              {currentAppPhase === 'processing_phase2' && 'Processing Phase 2...'}
              {currentAppPhase === 'phase2_done' && 'Phase 2 Complete'}
              {currentAppPhase === 'processing_phase3' && 'Processing Phase 3...'}
              {currentAppPhase === 'phase3_done' && 'All Phases Complete'}
            </div>
          </div>
        </div>

        {/* Phase 1: Initial Setup and Processing */}
        {(currentAppPhase === 'initial' || currentAppPhase === 'processing_phase1') && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Phase 1: Contact Deduplication</h2>
              <FileUploader
                appPhase={currentAppPhase}
                basisFile={phase1BasisFile}
                comparisonFiles={phase1ComparisonFiles}
                columnMapping={columnMapping}
                onBasisFileChange={setPhase1BasisFile}
                onComparisonFilesChange={setPhase1ComparisonFiles}
                onColumnMappingChange={setColumnMapping}
                phase2BasisFile={phase2BasisFile}
                phase2ComparisonFiles={phase2ComparisonFiles}
                onPhase2BasisFileChange={setPhase2BasisFile}
                onPhase2ComparisonFilesChange={setPhase2ComparisonFiles}
                disabled={processingState.isProcessing}
              />
              
              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleStartProcessing}
                  disabled={!canStartPhase1 || processingState.isProcessing}
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Start Phase 1 Processing
                </button>
              </div>
            </div>

            {processingState.isProcessing && (
              <div className="space-y-6">
                <ProgressTracker state={processingState} />
                {performanceMetrics && <PerformanceMonitor metrics={performanceMetrics} />}
              </div>
            )}
          </div>
        )}

        {/* Phase 1 Results */}
        {currentAppPhase === 'phase1_done' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Phase 1 Results</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDownloadModifiedBasisFile}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Download Modified Basis File
                  </button>
                  <button
                    onClick={handleStartPhase2Setup}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    Start Phase 2
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </button>
                </div>
              </div>
              <ResultsTable results={results} />
            </div>
            {performanceMetrics && <PerformanceMonitor metrics={performanceMetrics} />}
          </div>
        )}

        {/* Phase 2: Setup */}
        {currentAppPhase === 'setup_phase2' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Phase 2: Jungo Contact Integration</h2>
              <FileUploader
                appPhase={currentAppPhase}
                basisFile={phase1BasisFile}
                comparisonFiles={phase1ComparisonFiles}
                columnMapping={columnMapping}
                onBasisFileChange={setPhase1BasisFile}
                onComparisonFilesChange={setPhase1ComparisonFiles}
                onColumnMappingChange={setColumnMapping}
                phase2BasisFile={phase2BasisFile}
                phase2ComparisonFiles={phase2ComparisonFiles}
                onPhase2BasisFileChange={setPhase2BasisFile}
                onPhase2ComparisonFilesChange={setPhase2ComparisonFiles}
              />
              
              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleStartPhase2Processing}
                  disabled={!canStartPhase2}
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Start Phase 2 Processing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 2: Processing */}
        {currentAppPhase === 'processing_phase2' && (
          <div className="space-y-6">
            <ProgressTracker state={processingState} />
            {performanceMetrics && <PerformanceMonitor metrics={performanceMetrics} />}
          </div>
        )}

        {/* Phase 2: Results */}
        {currentAppPhase === 'phase2_done' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Phase 2 Results</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDownloadModifiedBasisFile}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Download Modified Basis File
                  </button>
                  <button
                    onClick={handleStartPhase3Processing}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Phase 3
                  </button>
                </div>
              </div>
              <ResultsTable results={results} />
            </div>
            {performanceMetrics && <PerformanceMonitor metrics={performanceMetrics} />}
          </div>
        )}

        {/* Phase 3: Processing */}
        {currentAppPhase === 'processing_phase3' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Phase 3: Email Domain Filtering</h2>
              
              <div className="mb-6">
                <div className="flex items-center justify-center py-4">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                    <p className="text-gray-600">Filtering email domains...</p>
                  </div>
                </div>
              </div>
              
              {/* Debug Messages */}
              {phase3DebugMessages.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Processing Details</h3>
                  <div className="bg-white rounded border border-gray-300 p-3 max-h-96 overflow-y-auto">
                    <div className="space-y-1 font-mono text-sm">
                      {phase3DebugMessages.map((message, index) => (
                        <div 
                          key={index} 
                          className={`${
                            message.includes('🗑️ REMOVING') ? 'text-red-600 font-semibold' :
                            message.includes('✅ KEEPING') ? 'text-green-600' :
                            message.includes('📊') ? 'text-blue-600 font-medium' :
                            message.includes('❌') ? 'text-red-600 font-semibold' :
                            'text-gray-700'
                          }`}
                        >
                          {message}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Phase 3: Final Report */}
        {currentAppPhase === 'phase3_done' && phase3Report && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Final Processing Report</h2>
                <button
                  onClick={handleDownloadModifiedBasisFile}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Download Final Basis File
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-2xl font-bold text-blue-600">
                    {phase3Report.phase1.initialBasisEmails.toLocaleString()}
                  </div>
                  <div className="text-sm text-blue-800">Initial Basis Emails</div>
                </div>
                
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="text-2xl font-bold text-green-600">
                    {phase3Report.final.totalDuplicatesFound.toLocaleString()}
                  </div>
                  <div className="text-sm text-green-800">Total Duplicates Found</div>
                </div>
                
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <div className="text-2xl font-bold text-red-600">
                    {phase3Report.phase3.emailsFiltered.toLocaleString()}
                  </div>
                  <div className="text-sm text-red-800">Emails Removed</div>
                </div>
                
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <div className="text-2xl font-bold text-purple-600">
                    {phase3Report.final.finalBasisEmails.toLocaleString()}
                  </div>
                  <div className="text-sm text-purple-800">Final Basis Emails</div>
                </div>
              </div>

              {/* Phase Details */}
              <div className="space-y-6">
                {/* Phase 1 Details */}
                <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                  <h3 className="text-lg font-semibold text-blue-900 mb-4">Phase 1: Contact Deduplication</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-2xl font-bold text-blue-700">
                        {phase3Report.phase1.initialBasisEmails.toLocaleString()}
                      </div>
                      <div className="text-sm text-blue-600">Initial Basis Emails</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-700">
                        {phase3Report.phase1.duplicatesFound.toLocaleString()}
                      </div>
                      <div className="text-sm text-blue-600">Duplicates Found</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-700">
                        {phase3Report.phase1.filesProcessed}
                      </div>
                      <div className="text-sm text-blue-600">Files Processed</div>
                    </div>
                  </div>
                </div>

                {/* Phase 2 Details */}
                <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                  <h3 className="text-lg font-semibold text-green-900 mb-4">Phase 2: Jungo Contact Integration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-2xl font-bold text-green-700">
                        {phase3Report.phase2.duplicatesFound.toLocaleString()}
                      </div>
                      <div className="text-sm text-green-600">Additional Duplicates Found</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-700">
                        {phase3Report.phase2.filesProcessed}
                      </div>
                      <div className="text-sm text-green-600">Files Processed</div>
                    </div>
                  </div>
                </div>

                {/* Phase 3 Details */}
                <div className="bg-red-50 rounded-lg p-6 border border-red-200">
                  <h3 className="text-lg font-semibold text-red-900 mb-4">Phase 3: Removing Emails by Domain</h3>
                  <p className="text-sm text-red-700 mb-4">
                    This phase removes email entries from the "email" column that match the specified domains (e.g., name@ccm.com, name@myccmortgage.com).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-2xl font-bold text-red-700">
                        {phase3Report.phase3.emailsFiltered.toLocaleString()}
                      </div>
                      <div className="text-sm text-red-600">Emails Removed</div>
                    </div>
                    <div>
                      <div className="text-sm text-red-600 mb-2">Removed Domains:</div>
                      <div className="flex flex-wrap gap-2">
                        {phase3Report.phase3.domainsFiltered.map((domain: string, index: number) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200"
                          >
                            {domain}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Final Summary */}
                <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Final Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-2xl font-bold text-gray-700">
                        {phase3Report.final.totalDuplicatesFound.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600">Total Duplicates Found</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-700">
                        {phase3Report.final.finalBasisEmails.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600">Final Basis Emails</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-700">
                        {phase3Report.final.totalFilesProcessed}
                      </div>
                      <div className="text-sm text-gray-600">Total Files Processed</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Final Results Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Final Duplicate Results</h3>
              <ResultsTable results={results} />
            </div>

            {performanceMetrics && <PerformanceMonitor metrics={performanceMetrics} />}
          </div>
        )}
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;