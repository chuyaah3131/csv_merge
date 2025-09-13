import React from 'react';
import { Upload, File, Settings, X } from 'lucide-react';

export interface ColumnMapping {
  emailColumn: string;
  firstNameColumn: string;
  lastNameColumn: string;
  splitNameColumn: boolean;
  groupsColumn?: string;
}

interface FileUploaderProps {
  appPhase: string;
  basisFile: File | null;
  comparisonFiles: File[];
  columnMapping: ColumnMapping;
  onBasisFileChange: (file: File | null) => void;
  onComparisonFilesChange: (files: File[]) => void;
  onColumnMappingChange: (mapping: ColumnMapping) => void;
  phase2BasisFile: File | null;
  phase2ComparisonFiles: File[];
  onPhase2BasisFileChange: (file: File | null) => void;
  onPhase2ComparisonFilesChange: (files: File[]) => void;
  disabled?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  appPhase,
  basisFile,
  comparisonFiles,
  columnMapping,
  onBasisFileChange,
  onComparisonFilesChange,
  onColumnMappingChange,
  phase2BasisFile,
  phase2ComparisonFiles,
  onPhase2BasisFileChange,
  onPhase2ComparisonFilesChange,
  disabled = false
}) => {
  const isPhase2 = appPhase === 'setup_phase2';
  const currentBasisFile = isPhase2 ? phase2BasisFile : basisFile;
  const currentComparisonFiles = isPhase2 ? phase2ComparisonFiles : comparisonFiles;
  const onCurrentBasisFileChange = isPhase2 ? onPhase2BasisFileChange : onBasisFileChange;
  const onCurrentComparisonFilesChange = isPhase2 ? onPhase2ComparisonFilesChange : onComparisonFilesChange;

  const handleBasisFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    onCurrentBasisFileChange(file);
  };

  const handleComparisonFilesUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    onCurrentComparisonFilesChange([...currentComparisonFiles, ...files]);
  };

  const removeComparisonFile = (index: number) => {
    const updatedFiles = currentComparisonFiles.filter((_, i) => i !== index);
    onCurrentComparisonFilesChange(updatedFiles);
  };

  const removeBasisFile = () => {
    onCurrentBasisFileChange(null);
  };

  return (
    <div className="space-y-6">
      {/* Column Mapping Configuration */}
      {!isPhase2 && (
        <div className="bg-gray-700 rounded-lg p-4 border border-gray-600">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-medium text-white">Column Mapping</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email Column
              </label>
              <input
                type="text"
                value={columnMapping.emailColumn}
                onChange={(e) => onColumnMappingChange({ ...columnMapping, emailColumn: e.target.value })}
                className="w-full bg-gray-600 border border-gray-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="email"
                disabled={disabled}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                First Name Column
              </label>
              <input
                type="text"
                value={columnMapping.firstNameColumn}
                onChange={(e) => onColumnMappingChange({ ...columnMapping, firstNameColumn: e.target.value })}
                className="w-full bg-gray-600 border border-gray-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="firstname"
                disabled={disabled}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Last Name Column
              </label>
              <input
                type="text"
                value={columnMapping.lastNameColumn}
                onChange={(e) => onColumnMappingChange({ ...columnMapping, lastNameColumn: e.target.value })}
                className="w-full bg-gray-600 border border-gray-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="lastname"
                disabled={disabled}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Groups Column (Optional)
              </label>
              <input
                type="text"
                value={columnMapping.groupsColumn || ''}
                onChange={(e) => onColumnMappingChange({ ...columnMapping, groupsColumn: e.target.value })}
                className="w-full bg-gray-600 border border-gray-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Groups"
                disabled={disabled}
              />
            </div>
          </div>
          
          <div className="mt-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={columnMapping.splitNameColumn}
                onChange={(e) => onColumnMappingChange({ ...columnMapping, splitNameColumn: e.target.checked })}
                className="rounded border-gray-500 text-blue-600 focus:ring-blue-500"
                disabled={disabled}
              />
              <span className="text-sm text-gray-300">
                Split combined name column (use first name column for full name)
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Basis File Upload */}
      <div className="bg-gray-700 rounded-lg p-6 border border-gray-600">
        <h3 className="text-lg font-medium text-white mb-4">
          {isPhase2 ? 'Phase 2 Basis File' : 'Basis File'}
        </h3>
        
        {currentBasisFile ? (
          <div className="flex items-center justify-center gap-3">
            <File className={`w-8 h-8 ${isPhase2 ? 'text-green-400' : 'text-blue-400'}`} />
            <div className="text-left">
              <div className="font-medium text-white">{currentBasisFile.name}</div>
              <div className="text-sm text-gray-400">
                {(currentBasisFile.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
            <button
              onClick={removeBasisFile}
              disabled={disabled}
              className="ml-auto p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-500 rounded-lg p-8 text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <div className="text-gray-300 mb-2">
              Upload {isPhase2 ? 'Phase 2' : ''} basis file
            </div>
            <input
              type="file"
              accept=".csv,.gz"
              onChange={handleBasisFileUpload}
              disabled={disabled}
              className="hidden"
              id={`basis-file-${isPhase2 ? 'phase2' : 'phase1'}`}
            />
            <label
              htmlFor={`basis-file-${isPhase2 ? 'phase2' : 'phase1'}`}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                isPhase2 ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isPhase2 ? 'focus:ring-green-500' : 'focus:ring-blue-500'
              } cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Choose File
            </label>
          </div>
        )}
      </div>

      {/* Comparison Files Upload */}
      <div className="bg-gray-700 rounded-lg p-6 border border-gray-600">
        <h3 className="text-lg font-medium text-white mb-4">
          {isPhase2 ? 'Phase 2 Comparison Files' : 'Comparison Files'}
        </h3>
        
        {currentComparisonFiles.length > 0 && (
          <div className="space-y-2 mb-4">
            {currentComparisonFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-3 bg-gray-600 rounded-lg p-3">
                <File className={`w-6 h-6 ${isPhase2 ? 'text-green-400' : 'text-blue-400'}`} />
                <div className="flex-1">
                  <div className="font-medium text-white">{file.name}</div>
                  <div className="text-sm text-gray-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
                <button
                  onClick={() => removeComparisonFile(index)}
                  disabled={disabled}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="border-2 border-dashed border-gray-500 rounded-lg p-8 text-center">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <div className="text-gray-300 mb-2">
            Upload {isPhase2 ? 'Phase 2' : ''} comparison files
          </div>
          <input
            type="file"
            accept=".csv,.gz"
            multiple
            onChange={handleComparisonFilesUpload}
            disabled={disabled}
            className="hidden"
            id={`comparison-files-${isPhase2 ? 'phase2' : 'phase1'}`}
          />
          <label
            htmlFor={`comparison-files-${isPhase2 ? 'phase2' : 'phase1'}`}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
              isPhase2 ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isPhase2 ? 'focus:ring-green-500' : 'focus:ring-blue-500'
            } cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Choose Files
          </label>
        </div>
      </div>
    </div>
  );
};