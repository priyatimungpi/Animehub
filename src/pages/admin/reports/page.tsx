import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminService, type ContentReport } from '../../../services/admin';
import { SparkleLoadingSpinner } from '../../../components/base/LoadingSpinner';
import ConfirmationDialog from '../../../components/admin/ConfirmationDialog';

export default function AdminReports() {
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updatingReport, setUpdatingReport] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ContentReport | null>(null);
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const [confirmationConfig, setConfirmationConfig] = useState<any>(null);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await AdminService.getContentReports(1, 50);
      setReports(result.reports);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleStatusUpdate = async (reportId: string, newStatus: ContentReport['status']) => {
    try {
      setUpdatingReport(reportId);
      await AdminService.updateReportStatus(reportId, newStatus);
      await fetchReports();
      setSuccessMessage(`Report status updated to ${newStatus}!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to update report status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update report status');
    } finally {
      setUpdatingReport(null);
    }
  };

  const handleViewReportDetails = (report: ContentReport) => {
    setSelectedReport(report);
    setShowReportModal(true);
  };

  const handleCloseModal = () => {
    setShowReportModal(false);
    setSelectedReport(null);
  };

  const handleStatusChange = async (reportId: string, newStatus: ContentReport['status']) => {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;

    setConfirmationConfig({
      title: 'Update Report Status',
      message: `Are you sure you want to change the status of this report to "${newStatus}"?`,
      confirmText: 'Update Status',
      type: 'warning',
      onConfirm: async () => {
        try {
          setUpdatingReport(reportId);
          await AdminService.updateReportStatus(reportId, newStatus);
          await fetchReports();
          setSuccessMessage(`Report status updated to ${newStatus}!`);
          setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
          console.error('Failed to update report status:', err);
          setError(err instanceof Error ? err.message : 'Failed to update report status');
        } finally {
          setUpdatingReport(null);
          setShowConfirmationDialog(false);
          setConfirmationConfig(null);
        }
      }
    });
    setShowConfirmationDialog(true);
  };

  const filteredReports = reports.filter(report => 
    filterStatus === 'all' || report.status === filterStatus
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'investigating': return '🔍';
      case 'resolved': return '✅';
      case 'dismissed': return '❌';
      default: return '📋';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'inappropriate_content': return '🚫';
      case 'copyright': return '©️';
      case 'spam': return '🗑️';
      case 'other': return '📝';
      default: return '📄';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Content Reports</h1>
          <p className="mt-2 text-gray-600">Manage and review user-submitted content reports</p>
        </div>

        {/* Error and Success Messages */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {successMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {successMessage}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-white/30 hover:bg-white/80 transition-all duration-300">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <span className="text-yellow-600 text-lg">⏳</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-gray-900">
                  {reports.filter(r => r.status === 'pending').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-white/30 hover:bg-white/80 transition-all duration-300">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 text-lg">🔍</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Investigating</p>
                <p className="text-2xl font-bold text-gray-900">
                  {reports.filter(r => r.status === 'investigating').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-white/30 hover:bg-white/80 transition-all duration-300">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-green-600 text-lg">✅</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Resolved</p>
                <p className="text-2xl font-bold text-gray-900">
                  {reports.filter(r => r.status === 'resolved').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-white/30 hover:bg-white/80 transition-all duration-300">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-gray-600 text-lg">📊</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total</p>
                <p className="text-2xl font-bold text-gray-900">{reports.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-white/30 mb-6">
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 rounded-lg font-medium backdrop-blur-sm border transition-all duration-300 ${
                filterStatus === 'all'
                  ? 'bg-blue-600/90 text-white border-blue-500/20 shadow-lg'
                  : 'bg-white/60 text-gray-700 border-white/30 hover:bg-white/80 hover:shadow-lg'
              }`}
            >
              All Reports
            </button>
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-4 py-2 rounded-lg font-medium backdrop-blur-sm border transition-all duration-300 ${
                filterStatus === 'pending'
                  ? 'bg-yellow-600/90 text-white border-yellow-500/20 shadow-lg'
                  : 'bg-white/60 text-gray-700 border-white/30 hover:bg-white/80 hover:shadow-lg'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilterStatus('investigating')}
              className={`px-4 py-2 rounded-lg font-medium backdrop-blur-sm border transition-all duration-300 ${
                filterStatus === 'investigating'
                  ? 'bg-blue-600/90 text-white border-blue-500/20 shadow-lg'
                  : 'bg-white/60 text-gray-700 border-white/30 hover:bg-white/80 hover:shadow-lg'
              }`}
            >
              Investigating
            </button>
            <button
              onClick={() => setFilterStatus('resolved')}
              className={`px-4 py-2 rounded-lg font-medium backdrop-blur-sm border transition-all duration-300 ${
                filterStatus === 'resolved'
                  ? 'bg-green-600/90 text-white border-green-500/20 shadow-lg'
                  : 'bg-white/60 text-gray-700 border-white/30 hover:bg-white/80 hover:shadow-lg'
              }`}
            >
              Resolved
            </button>
          </div>
        </div>

        {/* Reports List */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <SparkleLoadingSpinner size="lg" text="Loading content reports..." />
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReports.map((report) => (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/70 backdrop-blur-sm border border-white/30 rounded-xl shadow-lg p-6 hover:bg-white/80 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <span className="text-2xl">{getTypeIcon(report.report_type || 'other')}</span>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 capitalize">
                          {report.report_type?.replace('_', ' ') || 'Unknown Type'}
                        </h3>
                        <p className="text-sm text-gray-500">ID: {report.id.slice(0, 8)}...</p>
                      </div>
                    </div>
                    
                    <p className="text-gray-700 mb-4">{report.description}</p>
                    
                    <div className="flex items-center space-x-4 text-sm">
                      <div className="flex items-center space-x-1">
                        <span>{getStatusIcon(report.status)}</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm border ${
                          report.status === 'pending' ? 'bg-yellow-200/90 text-yellow-900 border-yellow-300/60' :
                          report.status === 'investigating' ? 'bg-blue-200/90 text-blue-900 border-blue-300/60' :
                          report.status === 'resolved' ? 'bg-green-200/90 text-green-900 border-green-300/60' :
                          'bg-gray-200/90 text-gray-900 border-gray-300/60'
                        }`}>
                          {report.status}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-1">
                        <span>{getPriorityIcon(report.priority)}</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm border ${
                          report.priority === 'high' ? 'bg-red-200/90 text-red-900 border-red-300/60' :
                          report.priority === 'medium' ? 'bg-orange-200/90 text-orange-900 border-orange-300/60' :
                          'bg-gray-200/90 text-gray-900 border-gray-300/60'
                        }`}>
                          {report.priority}
                        </span>
                      </div>
                      
                      <span className="text-gray-500">
                        Reported by: {report.reported_by}
                      </span>
                      
                      <span className="text-gray-500">
                        {new Date(report.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-2 ml-6">
                    {report.status === 'pending' && (
                      <button
                        onClick={() => handleStatusUpdate(report.id, 'investigating')}
                        disabled={updatingReport === report.id}
                        className="px-4 py-2 bg-blue-600/90 backdrop-blur-sm text-white rounded-lg hover:bg-blue-700/90 disabled:opacity-50 transition-all duration-300 shadow-lg hover:shadow-xl border border-blue-500/20"
                      >
                        {updatingReport === report.id ? 'Updating...' : 'Start Investigation'}
                      </button>
                    )}
                    
                    {report.status === 'investigating' && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleStatusUpdate(report.id, 'resolved')}
                          disabled={updatingReport === report.id}
                          className="px-4 py-2 bg-green-600/90 backdrop-blur-sm text-white rounded-lg hover:bg-green-700/90 disabled:opacity-50 transition-all duration-300 shadow-lg hover:shadow-xl border border-green-500/20"
                        >
                          {updatingReport === report.id ? 'Updating...' : 'Resolve'}
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(report.id, 'dismissed')}
                          disabled={updatingReport === report.id}
                          className="px-4 py-2 bg-gray-600/90 backdrop-blur-sm text-white rounded-lg hover:bg-gray-700/90 disabled:opacity-50 transition-all duration-300 shadow-lg hover:shadow-xl border border-gray-500/20"
                        >
                          {updatingReport === report.id ? 'Updating...' : 'Dismiss'}
                        </button>
                      </div>
                    )}
                    
                    <button 
                      onClick={() => handleViewReportDetails(report)}
                      className="px-4 py-2 bg-white/60 backdrop-blur-sm border border-white/30 text-gray-700 rounded-lg hover:bg-white/80 hover:shadow-lg transition-all duration-300"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
            
            {filteredReports.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">📋</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No reports found</h3>
                <p className="text-gray-500">
                  {filterStatus === 'all' 
                    ? 'There are no content reports to display.' 
                    : `No reports with status "${filterStatus}" found.`
                  }
                </p>
              </div>
            )}
          </div>
        )}

        {/* Report Details Modal */}
        <AnimatePresence>
          {showReportModal && selectedReport && (
            <div className="fixed inset-0 bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-pink-900/20 backdrop-blur-md flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                  <h2 className="text-2xl font-bold text-white drop-shadow-lg">Report Details</h2>
                  <button
                    onClick={handleCloseModal}
                    className="text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-6">
                  {/* Report Header */}
                  <div className="flex items-start space-x-6 mb-6">
                    {/* Report Icon */}
                    <div className="flex-shrink-0">
                      <div className="h-24 w-24 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-xl">
                        <span className="text-4xl">{getTypeIcon(selectedReport.report_type || 'other')}</span>
                      </div>
                    </div>

                    {/* Report Details */}
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <h3 className="text-3xl font-bold text-white drop-shadow-lg">{selectedReport.title}</h3>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm border ${
                          selectedReport.status === 'pending' ? 'bg-yellow-500/30 text-yellow-200 border-yellow-500/50' :
                          selectedReport.status === 'investigating' ? 'bg-blue-500/30 text-blue-200 border-blue-500/50' :
                          selectedReport.status === 'resolved' ? 'bg-green-500/30 text-green-200 border-green-500/50' :
                          'bg-gray-500/30 text-gray-200 border-gray-500/50'
                        }`}>
                          {getStatusIcon(selectedReport.status)} {selectedReport.status}
                        </span>
                      </div>
                      
                      <p className="text-white/95 text-lg mb-4 drop-shadow-sm">
                        {selectedReport.description || 'No description available'}
                      </p>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center space-x-2 bg-white/15 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                          <span className="text-white/90">🆔</span>
                          <span className="text-white font-mono text-xs">{selectedReport.id}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 bg-white/15 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                          <span className="text-white/90">📋</span>
                          <span className="text-white capitalize">{selectedReport.report_type?.replace('_', ' ') || 'Unknown'}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 bg-white/15 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                          <span className="text-white/90">⚠️</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            selectedReport.priority === 'high' ? 'bg-red-500/30 text-red-300' :
                            selectedReport.priority === 'medium' ? 'bg-orange-500/30 text-orange-300' :
                            'bg-gray-500/30 text-gray-300'
                          }`}>
                            {getPriorityIcon(selectedReport.priority)} {selectedReport.priority}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-2 bg-white/15 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                          <span className="text-white/90">👤</span>
                          <span className="text-white">{selectedReport.reported_by}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 bg-white/15 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                          <span className="text-white/90">📅</span>
                          <span className="text-white">{new Date(selectedReport.created_at).toLocaleDateString()}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 bg-white/15 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                          <span className="text-white/90">🔄</span>
                          <span className="text-white">{new Date(selectedReport.updated_at).toLocaleDateString()}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 bg-white/15 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                          <span className="text-white/90">🎯</span>
                          <span className="text-white capitalize">{selectedReport.content_type}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 bg-white/15 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                          <span className="text-white/90">🔗</span>
                          <span className="text-white font-mono text-xs">{selectedReport.content_id}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="border-t border-white/10 pt-6 mt-6">
                    <h4 className="text-lg font-semibold text-white drop-shadow-lg mb-4">Quick Actions</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-white">Change Status</label>
                        <select
                          value={selectedReport.status}
                          onChange={(e) => handleStatusChange(selectedReport.id, e.target.value as ContentReport['status'])}
                          disabled={updatingReport === selectedReport.id}
                          className="w-full px-3 py-2 bg-white/15 backdrop-blur-sm border border-white/30 rounded-lg text-white placeholder-white/70 focus:ring-2 focus:ring-white/40 focus:border-white/40 disabled:opacity-50"
                        >
                          <option value="pending" className="bg-gray-800 text-white">Pending</option>
                          <option value="investigating" className="bg-gray-800 text-white">Investigating</option>
                          <option value="resolved" className="bg-gray-800 text-white">Resolved</option>
                          <option value="dismissed" className="bg-gray-800 text-white">Dismissed</option>
                        </select>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-white">Actions</label>
                        <div className="flex space-x-2">
                          <button
                            onClick={handleCloseModal}
                            className="px-4 py-2 bg-white/15 backdrop-blur-sm text-white rounded-lg hover:bg-white/25 transition-all duration-200 border border-white/30 hover:border-white/40 font-medium"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={showConfirmationDialog}
          onClose={() => setShowConfirmationDialog(false)}
          onConfirm={confirmationConfig?.onConfirm || (() => {})}
          title={confirmationConfig?.title || ''}
          message={confirmationConfig?.message || ''}
          confirmText={confirmationConfig?.confirmText || 'Confirm'}
          type={confirmationConfig?.type || 'warning'}
          isLoading={updatingReport !== null}
        />
      </div>
    </div>
  );
}