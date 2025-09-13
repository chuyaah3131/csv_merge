import React from 'react';
import { Activity, Zap, Clock, Cpu } from 'lucide-react';

interface PerformanceMetrics {
  rowsPerSecond: number;
  memoryUsage: number;
  workerUtilization: number;
  totalProcessingTime: number;
}

interface PerformanceMonitorProps {
  metrics: PerformanceMetrics;
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({ metrics }) => {
  const formatTime = (milliseconds: number) => {
    if (milliseconds < 1000) return `${milliseconds}ms`;
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 0.8) return 'text-green-400';
    if (utilization >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getMemoryColor = (usage: number) => {
    if (usage >= 0.8) return 'text-red-400';
    if (usage >= 0.6) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-blue-400" />
        Performance Monitor
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Processing Speed */}
        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-gray-300">Processing Speed</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {metrics.rowsPerSecond > 0 ? metrics.rowsPerSecond.toFixed(0) : '0'}
          </div>
          <div className="text-sm text-gray-400">rows/second</div>
        </div>

        {/* Memory Usage */}
        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-300">Memory Usage</span>
          </div>
          <div className={`text-2xl font-bold ${getMemoryColor(metrics.memoryUsage)}`}>
            {(metrics.memoryUsage * 100).toFixed(1)}%
          </div>
          <div className="w-full bg-gray-600 rounded-full h-2 mt-2">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                metrics.memoryUsage >= 0.8 ? 'bg-red-500' :
                metrics.memoryUsage >= 0.6 ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${metrics.memoryUsage * 100}%` }}
            />
          </div>
        </div>

        {/* Worker Utilization */}
        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-300">Worker Utilization</span>
          </div>
          <div className={`text-2xl font-bold ${getUtilizationColor(metrics.workerUtilization)}`}>
            {(metrics.workerUtilization * 100).toFixed(0)}%
          </div>
          <div className="w-full bg-gray-600 rounded-full h-2 mt-2">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                metrics.workerUtilization >= 0.8 ? 'bg-green-500' :
                metrics.workerUtilization >= 0.5 ? 'bg-yellow-500' :
                'bg-red-500'
              }`}
              style={{ width: `${metrics.workerUtilization * 100}%` }}
            />
          </div>
        </div>

        {/* Processing Time */}
        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-300">Total Time</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {formatTime(metrics.totalProcessingTime)}
          </div>
          <div className="text-sm text-gray-400">
            {metrics.totalProcessingTime > 0 ? 'elapsed' : 'waiting'}
          </div>
        </div>
      </div>

      {/* Performance Tips */}
      {metrics.memoryUsage > 0.7 && (
        <div className="mt-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3">
          <div className="text-yellow-300 text-sm font-medium mb-1">Performance Tip</div>
          <div className="text-yellow-200 text-sm">
            High memory usage detected. Consider reducing chunk size or closing other browser tabs.
          </div>
        </div>
      )}

      {metrics.workerUtilization < 0.5 && metrics.rowsPerSecond > 0 && (
        <div className="mt-4 bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
          <div className="text-blue-300 text-sm font-medium mb-1">Performance Info</div>
          <div className="text-blue-200 text-sm">
            Worker utilization is low. Your system can handle larger chunk sizes for faster processing.
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceMonitor;