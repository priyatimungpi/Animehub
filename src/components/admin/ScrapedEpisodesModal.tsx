import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { HiAnimeScraperService } from '../../services/scrapers/hianime';

interface ScrapedEpisode {
  number: number;
  title: string;
  streamUrl: string;
  embeddingProtected: boolean;
  embeddingReason?: string;
  scrapedAt: string;
}

interface ScrapedEpisodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  animeId: string;
  animeTitle: string;
  scrapedEpisodes: ScrapedEpisode[];
  failedEpisodes: Array<{
    number: number;
    title: string;
    error: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    embeddingProtected: number;
  };
  onEpisodesAdded: () => void;
}

export const ScrapedEpisodesModal: React.FC<ScrapedEpisodesModalProps> = ({
  isOpen,
  onClose,
  animeId,
  animeTitle,
  scrapedEpisodes,
  failedEpisodes,
  summary,
  onEpisodesAdded
}) => {
  const [addingEpisodes, setAddingEpisodes] = useState<Set<number>>(new Set());
  const [addedEpisodes, setAddedEpisodes] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAddEpisode = async (episode: ScrapedEpisode) => {
    try {
      setAddingEpisodes(prev => new Set(prev).add(episode.number));
      setError(null);

      const result = await HiAnimeScraperService.addScrapedEpisode(animeId, {
        number: episode.number,
        title: episode.title,
        streamUrl: episode.streamUrl,
        embeddingProtected: episode.embeddingProtected,
        embeddingReason: episode.embeddingReason
      });

      if (result.success) {
        setAddedEpisodes(prev => new Set(prev).add(episode.number));
        setSuccess(result.message || `Episode ${episode.number} added successfully!`);
        setTimeout(() => setSuccess(null), 3000);
        onEpisodesAdded();
      } else {
        setError(result.error || 'Failed to add episode');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setTimeout(() => setError(null), 5000);
    } finally {
      setAddingEpisodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(episode.number);
        return newSet;
      });
    }
  };

  const handleAddAllEpisodes = async () => {
    const episodesToAdd = scrapedEpisodes.filter(ep => !addedEpisodes.has(ep.number));
    
    for (const episode of episodesToAdd) {
      await handleAddEpisode(episode);
      // Small delay between additions
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const getEmbeddingStatusColor = (isProtected: boolean) => {
    return isProtected ? 'text-red-600 bg-red-100' : 'text-green-600 bg-green-100';
  };

  const getEmbeddingStatusIcon = (isProtected: boolean) => {
    return isProtected ? '⚠️' : '✅';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Scraped Episodes</h2>
            <p className="text-gray-600 mt-1">{animeTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary Stats */}
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{summary.total}</div>
              <div className="text-sm text-blue-600">Total Episodes</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{summary.successful}</div>
              <div className="text-sm text-green-600">Successfully Scraped</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{summary.failed}</div>
              <div className="text-sm text-red-600">Failed</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{summary.embeddingProtected}</div>
              <div className="text-sm text-yellow-600">Embedding Protected</div>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-6 mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mx-6 mt-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        {/* Actions */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Episodes</h3>
            <div className="flex space-x-2">
              <button
                onClick={handleAddAllEpisodes}
                disabled={scrapedEpisodes.every(ep => addedEpisodes.has(ep.number)) || addingEpisodes.size > 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {addingEpisodes.size > 0 ? 'Adding...' : 'Add All Episodes'}
              </button>
            </div>
          </div>
        </div>

        {/* Episodes List */}
        <div className="p-6">
          <div className="space-y-4">
            {scrapedEpisodes.map((episode) => (
              <motion.div
                key={episode.number}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-50 rounded-lg p-4 border border-gray-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                        {episode.number}
                      </span>
                      <h4 className="text-lg font-semibold text-gray-900">{episode.title}</h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEmbeddingStatusColor(episode.embeddingProtected)}`}>
                        {getEmbeddingStatusIcon(episode.embeddingProtected)} {episode.embeddingProtected ? 'Protected' : 'Embeddable'}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-2">
                      <div className="break-all">
                        <strong>URL:</strong> {episode.streamUrl}
                      </div>
                      {episode.embeddingReason && (
                        <div className="mt-1">
                          <strong>Protection Reason:</strong> {episode.embeddingReason}
                        </div>
                      )}
                      <div className="mt-1">
                        <strong>Scraped:</strong> {new Date(episode.scrapedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {addedEpisodes.has(episode.number) ? (
                      <span className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                        ✅ Added
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAddEpisode(episode)}
                        disabled={addingEpisodes.has(episode.number)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                      >
                        {addingEpisodes.has(episode.number) ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Adding...</span>
                          </>
                        ) : (
                          <>
                            <span>➕</span>
                            <span>Add Episode</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
            
            {scrapedEpisodes.length === 0 && (
              <div className="text-center py-8">
                <div className="text-gray-400 text-4xl mb-2">📺</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Episodes Scraped</h3>
                <p className="text-gray-500">Try scraping again or check if the anime exists on 9anime.org.lv</p>
              </div>
            )}
          </div>

          {/* Failed Episodes */}
          {failedEpisodes.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Failed Episodes</h3>
              <div className="space-y-2">
                {failedEpisodes.map((episode) => (
                  <div key={episode.number} className="bg-red-50 rounded-lg p-3 border border-red-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-red-900">Episode {episode.number}: {episode.title}</span>
                        <div className="text-sm text-red-600 mt-1">{episode.error}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
