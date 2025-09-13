import React, { useState, useRef, useCallback } from 'react';
import { FileUploader } from './components/FileUploader';
import { ResultsTable } from './components/ResultsTable';
import { ProgressTracker } from './components/ProgressTracker';
import { PerformanceMonitor } from './components/PerformanceMonitor';
import { CSVDuplicateDetector, DuplicateResult, ProcessingState, PerformanceMetrics, ColumnMapping } from './core/CSVDuplicateDetector';
import { Play, CheckCircle, ArrowRight } from 'lucide-react';

type AppPhase = 'initial' | 'processing_phase1' | 'phase1_done' | 'setup_phase2' | 'processing_phase2' | 'phase2_done';

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
    }
  }, []);

  // Phase 1 handlers
  const handleStartProcessing = useCallback(async () => {
    if (!phase1BasisFile || phase1ComparisonFiles.length === 0 || !detectorRef.current) return;
    
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

  const handleDownloadModifiedBasisFile = useCallback(async () => {
    if (!detectorRef.current) return;
    
    try {
      await detectorRef.current.exportModifiedBasisFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download modified basis file');
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
                ['initial', 'processing_phase1', 'phase1_done'].includes(currentAppPhase) 
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
                ['setup_phase2', 'processing_phase2', 'phase2_done'].includes(currentAppPhase)
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
            </div>
            
            <div className="text-sm text-gray-500">
              {currentAppPhase === 'initial' && 'Ready to start Phase 1'}
              {currentAppPhase === 'processing_phase1' && 'Processing Phase 1...'}
              {currentAppPhase === 'phase1_done' && 'Phase 1 Complete'}
              {currentAppPhase === 'setup_phase2' && 'Setting up Phase 2'}
              {currentAppPhase === 'processing_phase2' && 'Processing Phase 2...'}
              {currentAppPhase === 'phase2_done' && 'Phase 2 Complete'}
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
                <button
                  onClick={handleDownloadModifiedBasisFile}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Download Modified Basis File
                </button>
              </div>
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