import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { HiAnimeScraperService } from '../../services/scrapers/hianime';
import { AdminAnimeService } from '../../services/admin/anime';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import LoadingSpinner from '../../components/base/LoadingSpinner';
import Card from '../../components/base/Card';
import { ScrapedEpisodesModal } from './ScrapedEpisodesModal';

interface Anime {
  id: string;
  title: string;
  total_episodes: number;
  status: string;
  poster_url?: string;
}

interface ScrapeResult {
  success: boolean;
  streamUrl?: string;
  episodeData?: any;
  error?: string;
}

interface BatchScrapeResult {
  success: boolean;
  results: ScrapeResult[];
  summary: {
    totalEpisodes: number;
    successCount: number;
    errorCount: number;
    successRate: number;
  };
}

export const AnimeScraperComponent: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [animeList, setAnimeList] = useState<Anime[]>([]);
  const [filteredAnime, setFilteredAnime] = useState<Anime[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [episodeRange, setEpisodeRange] = useState('');
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Scraped episodes modal state
  const [showScrapedEpisodes, setShowScrapedEpisodes] = useState(false);
  const [scrapedEpisodesData, setScrapedEpisodesData] = useState<any>(null);
  const [episodesAddedCount, setEpisodesAddedCount] = useState(0);
  const [currentScrapedEpisodes, setCurrentScrapedEpisodes] = useState<any[]>([]);
  const [existingEpisodes, setExistingEpisodes] = useState<Set<number>>(new Set());

  // Load anime list on component mount
  useEffect(() => {
    loadAnimeList();
  }, []);

  // Filter anime based on search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredAnime(animeList);
    } else {
      const filtered = animeList.filter(anime =>
        anime.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredAnime(filtered);
    }
  }, [searchTerm, animeList]);

  const loadAnimeList = async () => {
    try {
      setIsLoading(true);
      const result = await AdminAnimeService.getAnimeList(1, 1000); // Get all anime
      setAnimeList(result.anime || []);
      setFilteredAnime(result.anime || []);
    } catch (error) {
      console.error('Error loading anime list:', error);
      setError('Failed to load anime list');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnimeSelect = async (anime: Anime) => {
    setSelectedAnime(anime);
    setSearchTerm(anime.title);
    setError(null);
    setSuccess(null);
    setScrapeResult(null);
    setBatchResult(null);
    setCurrentScrapedEpisodes([]);
    setEpisodesAddedCount(0);
    
    // Check existing episodes for this anime
    await checkExistingEpisodes(anime.id);
  };

  const checkExistingEpisodes = async (animeId: string) => {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(animeId)) {
      console.warn('Invalid anime ID format, skipping existing episodes check');
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/anime/${animeId}/episodes`);
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          const existingNumbers = new Set<number>(data.episodes?.map((ep: any) => ep.episode_number as number) || []);
          setExistingEpisodes(existingNumbers);
        } else {
          console.warn('Response is not JSON, skipping existing episodes check');
        }
      } else {
        console.warn(`Failed to fetch episodes: ${response.status}`);
      }
    } catch (error) {
      console.error('Error checking existing episodes:', error);
    }
  };

  const handleSingleScrape = async () => {
    if (!selectedAnime) {
      setError('Please select an anime first');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await HiAnimeScraperService.scrapeAnimeEpisode(
        selectedAnime.title,
        selectedAnime.id,
        episodeNumber
      );

      setScrapeResult(result);
      
      if (result.success) {
        setSuccess(`Episode ${episodeNumber} scraped successfully!`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || 'Scraping failed');
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchScrape = async () => {
    if (!selectedAnime) {
      setError('Please select an anime first');
      return;
    }

    // Parse episode range (e.g., "1-5" or "1,3,5" or "1")
    let episodeNumbers: number[];
    if (episodeRange.includes('-')) {
      const [start, end] = episodeRange.split('-').map(Number);
      episodeNumbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    } else if (episodeRange.includes(',')) {
      episodeNumbers = episodeRange.split(',').map(Number);
    } else {
      episodeNumbers = [parseInt(episodeRange)];
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setBatchResult(null);

    try {
      const result = await HiAnimeScraperService.batchScrapeEpisodes(
        selectedAnime.title,
        selectedAnime.id,
        episodeNumbers,
        {
          headless: true,
          timeout: 30000,
          retries: 2,
          delayBetweenEpisodes: 3000
        }
      );

      if (result.success && result.results) {
        // Convert results to scraped episodes format for direct display
        const scrapedEpisodes = result.results
          .filter((r: any) => r.status === 'success')
          .map((r: any) => ({
            number: r.episode,
            title: r.title,
            streamUrl: r.url,
            embeddingProtected: r.embeddingProtected || false,
            embeddingReason: r.embeddingReason || null,
            scrapedAt: r.scrapedAt || new Date().toISOString(),
            isExisting: existingEpisodes.has(r.episode)
          }));

        // Show episodes directly in results (no modal)
        setCurrentScrapedEpisodes(scrapedEpisodes);
        
        setSuccess(`Batch scraping completed: ${scrapedEpisodes.length}/${episodeNumbers.length} episodes scraped successfully!`);
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError((result as any).error || 'Batch scraping failed');
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScrapeAllEpisodes = async () => {
    if (!selectedAnime) {
      setError('Please select an anime first');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await HiAnimeScraperService.scrapeAllEpisodes(selectedAnime.title, {
        animeId: selectedAnime.id,
        maxEpisodes: selectedAnime.total_episodes || 50
      });

      if (result.success && result.data) {
        setScrapedEpisodesData(result.data);
        setShowScrapedEpisodes(true);
        setSuccess(`Scraped ${result.data.summary?.successful || 0} episodes successfully!`);
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError(result.error || 'Scraping failed');
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseScrapedEpisodes = () => {
    setShowScrapedEpisodes(false);
    setScrapedEpisodesData(null);
  };

  const handleAddEpisode = async (episode: any) => {
    if (!selectedAnime) return;
    
    try {
      const response = await fetch('http://localhost:3001/api/add-scraped-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animeId: selectedAnime.id,
          episodeData: {
            number: episode.number,
            title: episode.title,
            streamUrl: episode.streamUrl,
            description: `Scraped from HiAnime`,
            isPremium: false
          }
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Update episode status
        setCurrentScrapedEpisodes(prev => 
          prev.map(ep => 
            ep.number === episode.number 
              ? { ...ep, isExisting: true, addedAt: new Date().toISOString() }
              : ep
          )
        );
        
        // Update existing episodes set
        setExistingEpisodes(prev => new Set([...prev, episode.number]));
        
        // Update counter
        setEpisodesAddedCount(prev => prev + 1);
        
        setSuccess(`Episode ${episode.number} added successfully!`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || 'Failed to add episode');
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      setError('Error adding episode');
      setTimeout(() => setError(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-800 mb-2">
          🎬 Anime Episode Scraper
        </h2>
        <p className="text-gray-600">
          Scrape episodes from 9anime.org.lv for your anime collection
        </p>
      </div>

      {/* Anime Selection */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">
          📺 Select Anime
        </h3>
        
        <div className="space-y-4">
          {/* Search Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Anime
            </label>
            <Input
              type="text"
              placeholder="Type anime name to search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Selected Anime Display */}
          {selectedAnime && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-4">
                {selectedAnime.poster_url && (
                  <img
                    src={selectedAnime.poster_url}
                    alt={selectedAnime.title}
                    className="w-16 h-20 object-cover rounded-lg"
                    width={64}
                    height={80}
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <div>
                  <h4 className="font-semibold text-blue-800">{selectedAnime.title}</h4>
                  <p className="text-sm text-blue-600">
                    {selectedAnime.total_episodes} episodes • {selectedAnime.status}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Anime List */}
          <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
            {isLoading ? (
              <div className="p-4 text-center">
                <LoadingSpinner size="sm" />
                <p className="text-gray-600 mt-2">Loading anime...</p>
              </div>
            ) : filteredAnime.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No anime found
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredAnime.map((anime) => (
                  <motion.div
                    key={anime.id}
                    whileHover={{ backgroundColor: '#f8fafc' }}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedAnime?.id === anime.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => handleAnimeSelect(anime)}
                  >
                    <div className="flex items-center space-x-3">
                      {anime.poster_url && (
                        <img
                          src={anime.poster_url}
                          alt={anime.title}
                          className="w-12 h-16 object-cover rounded"
                          width={48}
                          height={64}
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-800">{anime.title}</h4>
                        <p className="text-sm text-gray-600">
                          {anime.total_episodes} episodes • {anime.status}
                        </p>
                      </div>
                      {selectedAnime?.id === anime.id && (
                        <div className="text-blue-600">
                          <i className="ri-check-line text-xl"></i>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Scraping Options */}
      {selectedAnime && (
        <Card className="p-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">
            🎯 Scraping Options
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Single Episode */}
            <div className="space-y-3">
              <h4 className="font-medium text-gray-700">Single Episode</h4>
              <Input
                type="number"
                placeholder="Episode number"
                value={episodeNumber}
                onChange={(e) => setEpisodeNumber(parseInt(e.target.value) || 1)}
                min="1"
              />
              <Button
                onClick={handleSingleScrape}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? <LoadingSpinner size="sm" /> : '🎬 Scrape Episode'}
              </Button>
            </div>

            {/* Batch Episodes */}
            <div className="space-y-3">
              <h4 className="font-medium text-gray-700">Batch Episodes</h4>
              <Input
                type="text"
                placeholder="1-5, 1,3,5, or 1"
                value={episodeRange}
                onChange={(e) => setEpisodeRange(e.target.value)}
              />
              <Button
                onClick={handleBatchScrape}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? <LoadingSpinner size="sm" /> : '📺 Batch Scrape'}
              </Button>
            </div>

            {/* All Episodes */}
            <div className="space-y-3">
              <h4 className="font-medium text-gray-700">All Episodes</h4>
              <div className="text-sm text-gray-600">
                Scrape all {selectedAnime.total_episodes} episodes
              </div>
              <Button
                onClick={handleScrapeAllEpisodes}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? <LoadingSpinner size="sm" /> : '🚀 Scrape All'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Results */}
      {(scrapeResult || batchResult || error || success || currentScrapedEpisodes.length > 0) && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-800">
              📊 Scraping Results
            </h3>
            <Button
              onClick={() => {
                setScrapeResult(null);
                setBatchResult(null);
                setError(null);
                setSuccess(null);
                setEpisodesAddedCount(0);
                setCurrentScrapedEpisodes([]);
              }}
              variant="secondary"
              size="sm"
              className="text-gray-600 hover:text-gray-800"
            >
              <i className="ri-close-line mr-1"></i>
              Clear Results
            </Button>
          </div>
          
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="flex items-center">
                <i className="ri-check-line text-green-600 text-xl mr-2"></i>
                <span className="text-green-800">{success}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-center">
                <i className="ri-error-warning-line text-red-600 text-xl mr-2"></i>
                <span className="text-red-800">{error}</span>
              </div>
            </div>
          )}

          {/* Single Episode Result */}
          {scrapeResult && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-700">🎬 Single Episode Result</h4>
              <div className={`p-4 rounded-lg ${
                scrapeResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                {scrapeResult.success ? (
                  <div>
                    <p className="text-green-800 font-medium">✅ Episode scraped successfully!</p>
                    <p className="text-sm text-green-600 mt-1">
                      Stream URL: {scrapeResult.streamUrl?.substring(0, 50)}...
                    </p>
                    <div className="mt-2 text-xs text-gray-500">
                      <p>Episode: {episodeNumber}</p>
                      <p>Anime: {selectedAnime?.title}</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-red-800">❌ {scrapeResult.error}</p>
                    <div className="mt-2 text-xs text-gray-500">
                      <p>Episode: {episodeNumber}</p>
                      <p>Anime: {selectedAnime?.title}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Batch Result */}
          {batchResult && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-700">📺 Batch Scraping Result</h4>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{batchResult.summary.totalEpisodes}</div>
                    <div className="text-sm text-gray-600">Total Episodes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{batchResult.summary.successCount}</div>
                    <div className="text-sm text-gray-600">Successfully Scraped</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{batchResult.summary.errorCount}</div>
                    <div className="text-sm text-gray-600">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{batchResult.summary.successRate.toFixed(1)}%</div>
                    <div className="text-sm text-gray-600">Success Rate</div>
                  </div>
                </div>
                
                <div className="text-sm text-gray-600">
                  <p><strong>Episodes Range:</strong> {episodeRange}</p>
                  <p><strong>Anime:</strong> {selectedAnime?.title}</p>
                  <p><strong>Scraped At:</strong> {new Date().toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}

          {/* Scraped Episodes List */}
          {currentScrapedEpisodes.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-700">🎬 Scraped Episodes</h4>
              <div className="space-y-2">
                {currentScrapedEpisodes.map((episode) => (
                  <div key={episode.number} className={`p-3 rounded-lg border ${
                    episode.isExisting 
                      ? 'bg-gray-50 border-gray-200' 
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <span className="font-medium text-gray-800">
                            Episode {episode.number}
                          </span>
                          <span className="text-sm text-gray-600">
                            {episode.title}
                          </span>
                          {episode.embeddingProtected && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                              Protected
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Stream URL: {episode.streamUrl?.substring(0, 50)}...
                        </div>
                      </div>
                      <div className="ml-4">
                        {episode.isExisting ? (
                          <div className="flex items-center text-green-600">
                            <i className="ri-check-line mr-1"></i>
                            <span className="text-sm font-medium">Added</span>
                          </div>
                        ) : (
                          <Button
                            onClick={() => handleAddEpisode(episode)}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <i className="ri-add-line mr-1"></i>
                            Add
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Episodes Added Summary */}
          {episodesAddedCount > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-700">✅ Episodes Added to Database</h4>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                  <i className="ri-check-line text-green-600 text-xl mr-2"></i>
                  <div>
                    <p className="text-green-800 font-medium">
                      {episodesAddedCount} episodes successfully added to database!
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      Anime: {selectedAnime?.title}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Instructions */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold text-blue-800 mb-3">
          📋 How to Use
        </h3>
        <div className="space-y-2 text-blue-700">
          <p><strong>1. Search & Select:</strong> Search for your anime and click to select it</p>
          <p><strong>2. Choose Method:</strong> Single episode, batch range, or all episodes</p>
          <p><strong>3. Scrape:</strong> Click the scrape button and wait for results</p>
          <p><strong>4. Review:</strong> Check the results and add episodes to your database</p>
        </div>
      </Card>

      {/* Scraped Episodes Modal */}
      {showScrapedEpisodes && scrapedEpisodesData && selectedAnime && (
        <ScrapedEpisodesModal
          isOpen={showScrapedEpisodes}
          onClose={handleCloseScrapedEpisodes}
          animeId={selectedAnime.id}
          animeTitle={selectedAnime.title}
          scrapedEpisodes={scrapedEpisodesData.scrapedEpisodes || []}
          failedEpisodes={scrapedEpisodesData.failedEpisodes || []}
          summary={scrapedEpisodesData.summary || { total: 0, successful: 0, failed: 0, embeddingProtected: 0 }}
          onEpisodesAdded={() => {
            handleCloseScrapedEpisodes();
            setSuccess('Episodes added successfully!');
            setTimeout(() => setSuccess(null), 5000);
            // Keep the results visible - don't clear them
          }}
        />
      )}
    </div>
  );
};
