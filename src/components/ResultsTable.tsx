import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, Filter } from 'lucide-react';

interface DuplicateResult {
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

interface ResultsTableProps {
  results: DuplicateResult[];
}

export const ResultsTable: React.FC<ResultsTableProps> = ({ results }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof DuplicateResult>('confidence');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [confidenceFilter, setConfidenceFilter] = useState<number>(0);

  // Virtual scrolling state
  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleEnd, setVisibleEnd] = useState(pageSize);

  const filteredResults = useMemo(() => {
    return results.filter(result => {
      const matchesSearch = searchTerm === '' || 
        result.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.sourceFile.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesConfidence = result.confidence >= confidenceFilter;
      
      return matchesSearch && matchesConfidence;
    });
  }, [results, searchTerm, confidenceFilter]);

  const sortedResults = useMemo(() => {
    return [...filteredResults].sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];
      
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = (bValue as string).toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  }, [filteredResults, sortField, sortDirection]);

  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedResults.slice(start, end);
  }, [sortedResults, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedResults.length / pageSize);

  const handleSort = (field: keyof DuplicateResult) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: keyof DuplicateResult }) => {
    if (field !== sortField) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-400';
    if (confidence >= 0.7) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email, name, or file..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={confidenceFilter}
              onChange={(e) => {
                setConfidenceFilter(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>All Confidence</option>
              <option value={0.5}>50%+ Confidence</option>
              <option value={0.7}>70%+ Confidence</option>
              <option value={0.9}>90%+ Confidence</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
            <option value={500}>500</option>
          </select>
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex justify-between items-center text-sm text-gray-400">
        <div>
          Showing {paginatedResults.length} of {sortedResults.length} results
          {filteredResults.length !== results.length && (
            <span> (filtered from {results.length} total)</span>
          )}
        </div>
        <div>
          Page {currentPage} of {totalPages}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-700 rounded-lg overflow-hidden border border-gray-600">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-600">
              <tr>
                <th 
                  className="px-4 py-3 text-left font-medium text-gray-200 cursor-pointer hover:bg-gray-500 transition-colors"
                  onClick={() => handleSort('email')}
                >
                  <div className="flex items-center gap-2">
                    Email
                    <SortIcon field="email" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left font-medium text-gray-200 cursor-pointer hover:bg-gray-500 transition-colors"
                  onClick={() => handleSort('firstName')}
                >
                  <div className="flex items-center gap-2">
                    First Name
                    <SortIcon field="firstName" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left font-medium text-gray-200 cursor-pointer hover:bg-gray-500 transition-colors"
                  onClick={() => handleSort('lastName')}
                >
                  <div className="flex items-center gap-2">
                    Last Name
                    <SortIcon field="lastName" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left font-medium text-gray-200 cursor-pointer hover:bg-gray-500 transition-colors"
                  onClick={() => handleSort('sourceFile')}
                >
                  <div className="flex items-center gap-2">
                    Source File
                    <SortIcon field="sourceFile" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left font-medium text-gray-200 cursor-pointer hover:bg-gray-500 transition-colors"
                  onClick={() => handleSort('confidence')}
                >
                  <div className="flex items-center gap-2">
                    Confidence
                    <SortIcon field="confidence" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left font-medium text-gray-200 cursor-pointer hover:bg-gray-500 transition-colors"
                  onClick={() => handleSort('rowIndex')}
                >
                  <div className="flex items-center gap-2">
                    Row #
                    <SortIcon field="rowIndex" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left font-medium text-gray-200 cursor-pointer hover:bg-gray-500 transition-colors"
                  onClick={() => handleSort('clientTypeVipStatus')}
                >
                  <div className="flex items-center gap-2">
                    Client Type / VIP Status
                    <SortIcon field="clientTypeVipStatus" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left font-medium text-gray-200 cursor-pointer hover:bg-gray-500 transition-colors"
                  onClick={() => handleSort('clientTypeProspects')}
                >
                  <div className="flex items-center gap-2">
                    Client Type / Prospects
                    <SortIcon field="clientTypeProspects" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedResults.map((result, index) => (
                <tr 
                  key={result.id} 
                  className="border-t border-gray-600 hover:bg-gray-600/50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-sm text-blue-300">
                    {result.email}
                  </td>
                  <td className="px-4 py-3 text-white">
                    {result.firstName}
                  </td>
                  <td className="px-4 py-3 text-white">
                    {result.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-300 truncate max-w-xs">
                    {result.sourceFile}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${getConfidenceColor(result.confidence)}`}>
                      {(result.confidence * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 font-mono">
                    {result.rowIndex}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      result.clientTypeVipStatus === 'VIP Client' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' :
                      result.clientTypeVipStatus === 'Customer' ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' :
                      result.clientTypeVipStatus === 'Realtor' ? 'bg-green-600/20 text-green-300 border border-green-500/30' :
                      result.clientTypeVipStatus === 'Financial Planner' ? 'bg-yellow-600/20 text-yellow-300 border border-yellow-500/30' :
                      result.clientTypeVipStatus === 'Other Partner' ? 'bg-orange-600/20 text-orange-300 border border-orange-500/30' :
                      'bg-gray-600/20 text-gray-300 border border-gray-500/30'
                    }`}>
                      {result.clientTypeVipStatus || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      result.clientTypeProspects === 'Prospect' ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30' :
                      result.clientTypeProspects === 'Customer' ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' :
                      result.clientTypeProspects === 'Realtor' ? 'bg-green-600/20 text-green-300 border border-green-500/30' :
                      result.clientTypeProspects === 'Financial Planner' ? 'bg-yellow-600/20 text-yellow-300 border border-yellow-500/30' :
                      result.clientTypeProspects === 'Other Partner' ? 'bg-orange-600/20 text-orange-300 border border-orange-500/30' :
                      result.clientTypeProspects === 'Personal' ? 'bg-pink-600/20 text-pink-300 border border-pink-500/30' :
                      result.clientTypeProspects === 'CPA' ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30' :
                      'bg-gray-600/20 text-gray-300 border border-gray-500/30'
                    }`}>
                      {result.clientTypeProspects || 'N/A'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 bg-gray-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
          >
            Previous
          </button>
          
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-2 rounded-lg transition-colors ${
                    pageNum === currentPage
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 bg-gray-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};