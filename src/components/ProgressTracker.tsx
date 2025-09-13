import React from 'react';
import { Clock, Database, TrendingUp } from 'lucide-react';

interface ProcessingState {
  isProcessing: boolean;
  isPaused: boolean;
  progress: number;
  currentFile: string;
  rowsProcessed: number;
  duplicatesFound: number;
  estimatedTimeRemaining: number;
}

interface ProgressTrackerProps {
  state: ProcessingState;
}

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({ state }) => {
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Processing Progress</h2>
        {state.isPaused && (
          <div className="px-3 py-1 bg-yellow-600/20 border border-yellow-500/30 rounded-full text-yellow-300 text-sm">
            Paused
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-300">Overall Progress</span>
          <span className="font-mono text-sm">{state.progress.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${
              state.isPaused ? 'bg-yellow-500' : 'bg-blue-500'
            }`}
            style={{ width: `${state.progress}%` }}
          />
        </div>
      </div>

      {/* Current Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-300">Rows Processed</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {formatNumber(state.rowsProcessed)}
          </div>
        </div>

        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-300">Duplicates Found</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {formatNumber(state.duplicatesFound)}
          </div>
        </div>

        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-gray-300">Time Remaining</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {state.estimatedTimeRemaining > 0 
              ? formatTime(state.estimatedTimeRemaining)
              : '--'
            }
          </div>
        </div>
      </div>

      {/* Current File */}
      {state.currentFile && (
        <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
          <div className="text-sm text-gray-300 mb-1">Currently Processing</div>
          <div className="font-medium text-white truncate">{state.currentFile}</div>
        </div>
      )}

      {/* Processing Animation */}
      <div className="mt-4 flex items-center justify-center">
        <div className="flex space-x-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-2 h-8 bg-blue-500 rounded animate-pulse ${
                state.isPaused ? 'opacity-50' : ''
              }`}
              style={{
                animationDelay: `${i * 0.2}s`,
                animationDuration: '1s'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};