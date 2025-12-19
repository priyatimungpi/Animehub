import React, { useState } from 'react';
import { HiAnimeScraperService } from '../../services/scrapers/hianime';
import { AdminAnimeService } from '../../services/admin/anime';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import LoadingSpinner from '../../components/base/LoadingSpinner';
import Card from '../../components/base/Card';
import { ScrapedEpisodesModal } from './ScrapedEpisodesModal';

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

export const HiAnimeScraperComponent: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [animeTitle, setAnimeTitle] = useState('');
  const [animeId, setAnimeId] = useState('');
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [episodeRange, setEpisodeRange] = useState('');
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [animeList, setAnimeList] = useState<any[]>([]);
  const [selectedAnime, setSelectedAnime] = useState<any>(null);
  
  // New state for all episodes scraping
  const [showScrapedEpisodes, setShowScrapedEpisodes] = useState(false);
  const [scrapedEpisodesData, setScrapedEpisodesData] = useState<any>(null);

  // Load anime list for selection
  React.useEffect(() => {
    loadAnimeList();
  }, []);

  const loadAnimeList = async () => {
    try {
      const result = await AdminAnimeService.getAnimeList(1, 50);
      setAnimeList(result.anime || []);
    } catch (error) {
      console.error('Error loading anime list:', error);
    }
  };

  const handleSingleScrape = async () => {
    if (!animeTitle.trim() || !animeId.trim()) {
      setError('Please provide both anime title and anime ID');
      return;
    }

    setIsLoading(true);
    setError(null);
    setScrapeResult(null);

    try {
      const result = await HiAnimeScraperService.scrapeAnimeEpisode(
        animeTitle,
        animeId,
        episodeNumber,
        {
          headless: true,
          timeout: 30000,
          retries: 3
        }
      );

      setScrapeResult(result);
      
      if (!result.success) {
        setError(result.error || 'Scraping failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchScrape = async () => {
    if (!animeTitle.trim() || !animeId.trim() || !episodeRange.trim()) {
      setError('Please provide anime title, anime ID, and episode range');
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
    setBatchResult(null);

    try {
      const result = await HiAnimeScraperService.batchScrapeEpisodes(
        animeTitle,
        animeId,
        episodeNumbers,
        {
          headless: true,
          timeout: 30000,
          retries: 2,
          delayBetweenEpisodes: 3000
        }
      );

      setBatchResult(result);
      
      if (!result.success) {
        setError(`Batch scraping completed with ${result.summary.errorCount} errors`);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // New function to scrape all episodes
  const handleScrapeAllEpisodes = async () => {
    if (!animeTitle || !animeId) {
      setError('Please select an anime first');
      return;
    }

    setIsLoading(true);
    setError(null);
    setScrapedEpisodesData(null);

    try {
      const result = await HiAnimeScraperService.scrapeAllEpisodes(animeTitle, {
        maxEpisodes: 50,
        timeout: 120000, // 2 minutes
        retries: 2
      });

      if (result.success && result.data) {
        setScrapedEpisodesData(result.data);
        setShowScrapedEpisodes(true);
      } else {
        setError(result.error || 'Failed to scrape episodes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnimeSelect = (anime: any) => {
    setSelectedAnime(anime);
    setAnimeTitle(anime.title);
    setAnimeId(anime.id);
  };

  const handleTestScraper = async () => {
    setIsLoading(true);
    setError(null);
    setScrapeResult(null);

    try {
      await HiAnimeScraperService.testScraper();
      setScrapeResult({
        success: true,
        streamUrl: 'Test completed - check console for details',
        episodeData: { test: true }
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Test failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">HiAnime.do Scraper</h2>
        <Button
          onClick={handleTestScraper}
          variant="outline"
          disabled={isLoading}
          className="text-sm"
        >
          🧪 Test Scraper
        </Button>
      </div>

      {/* Anime Selection */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Select Anime</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Anime
            </label>
            <Input
              type="text"
              placeholder="Search anime..."
              value={animeTitle}
              onChange={(e) => setAnimeTitle(e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Anime ID (UUID)
            </label>
            <Input
              type="text"
              placeholder="Anime UUID from database"
              value={animeId}
              onChange={(e) => setAnimeId(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {/* Anime List */}
        {animeList.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Or select from existing anime:
            </label>
            <div className="max-h-40 overflow-y-auto border rounded-md">
              {animeList.slice(0, 10).map((anime) => (
                <button
                  key={anime.id}
                  onClick={() => handleAnimeSelect(anime)}
                  className={`w-full text-left px-3 py-2 hover:bg-gray-100 border-b last:border-b-0 ${
                    selectedAnime?.id === anime.id ? 'bg-blue-50 text-blue-700' : ''
                  }`}
                >
                  <div className="font-medium">{anime.title}</div>
                  <div className="text-sm text-gray-500">ID: {anime.id}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Single Episode Scraping */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Single Episode Scraping</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Episode Number
            </label>
            <Input
              type="number"
              min="1"
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(parseInt(e.target.value) || 1)}
              className="w-full"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleSingleScrape}
              disabled={isLoading || !animeTitle.trim() || !animeId.trim()}
              className="w-full"
            >
              {isLoading ? <LoadingSpinner size="sm" /> : '🎬 Scrape Episode'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Batch Episode Scraping */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Batch Episode Scraping</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Episode Range
            </label>
            <Input
              type="text"
              placeholder="e.g., 1-5, 1,3,5, or 1"
              value={episodeRange}
              onChange={(e) => setEpisodeRange(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Examples: 1-5 (episodes 1 through 5), 1,3,5 (specific episodes), 1 (single episode)
            </p>
          </div>
          <div className="flex items-end space-x-2">
            <Button
              onClick={handleBatchScrape}
              disabled={isLoading || !animeTitle.trim() || !animeId.trim() || !episodeRange.trim()}
              variant="secondary"
              className="flex-1"
            >
              {isLoading ? <LoadingSpinner size="sm" /> : '📺 Batch Scrape'}
            </Button>
            <Button
              onClick={handleScrapeAllEpisodes}
              disabled={isLoading || !animeTitle.trim() || !animeId.trim()}
              variant="primary"
              className="flex-1"
            >
              {isLoading ? <LoadingSpinner size="sm" /> : '🎬 Scrape All Episodes'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="p-6 border-red-200 bg-red-50">
          <div className="flex items-center">
            <div className="text-red-600 mr-2">❌</div>
            <div className="text-red-800">{error}</div>
          </div>
        </Card>
      )}

      {/* Single Scrape Result */}
      {scrapeResult && (
        <Card className="p-6 border-green-200 bg-green-50">
          <h3 className="text-lg font-semibold mb-4 text-green-800">
            {scrapeResult.success ? '✅ Scraping Successful' : '❌ Scraping Failed'}
          </h3>
          
          {scrapeResult.success ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-green-700 mb-1">
                  Stream URL:
                </label>
                <div className="bg-white p-2 rounded border text-sm font-mono break-all">
                  {scrapeResult.streamUrl}
                </div>
              </div>
              
              {scrapeResult.episodeData && (
                <div>
                  <label className="block text-sm font-medium text-green-700 mb-1">
                    Episode Data:
                  </label>
                  <pre className="bg-white p-2 rounded border text-xs overflow-auto">
                    {JSON.stringify(scrapeResult.episodeData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="text-red-800">
              <strong>Error:</strong> {scrapeResult.error}
            </div>
          )}
        </Card>
      )}

      {/* Batch Scrape Result */}
      {batchResult && (
        <Card className="p-6 border-blue-200 bg-blue-50">
          <h3 className="text-lg font-semibold mb-4 text-blue-800">
            📊 Batch Scraping Results
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{batchResult.summary.totalEpisodes}</div>
              <div className="text-sm text-blue-700">Total Episodes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{batchResult.summary.successCount}</div>
              <div className="text-sm text-green-700">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{batchResult.summary.errorCount}</div>
              <div className="text-sm text-red-700">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{batchResult.summary.successRate.toFixed(1)}%</div>
              <div className="text-sm text-purple-700">Success Rate</div>
            </div>
          </div>

          {/* Detailed Results */}
          <div className="space-y-2">
            <h4 className="font-medium text-blue-800">Episode Results:</h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {batchResult.results.map((result, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-2 rounded text-sm ${
                    result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  <span>Episode {index + 1}</span>
                  <span>{result.success ? '✅ Success' : `❌ ${result.error}`}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Instructions */}
      <Card className="p-6 border-gray-200 bg-gray-50">
        <h3 className="text-lg font-semibold mb-4">📋 Instructions</h3>
        <div className="space-y-3 text-sm text-gray-700">
          <div>
            <strong>1. Setup:</strong> Make sure you have Playwright installed: <code className="bg-gray-200 px-1 rounded">npm run install-playwright</code>
          </div>
          <div>
            <strong>2. Single Episode:</strong> Enter anime title, anime ID, and episode number to scrape one episode.
          </div>
          <div>
            <strong>3. Batch Scraping:</strong> Use episode range format (1-5, 1,3,5, or 1) to scrape multiple episodes.
          </div>
          <div>
            <strong>4. Anime ID:</strong> Use the UUID from your anime database, not external IDs.
          </div>
          <div>
            <strong>5. Rate Limiting:</strong> The scraper includes delays between requests to avoid being blocked.
          </div>
        </div>
      </Card>

      {/* Scraped Episodes Modal */}
      {showScrapedEpisodes && scrapedEpisodesData && (
        <ScrapedEpisodesModal
          isOpen={showScrapedEpisodes}
          onClose={() => setShowScrapedEpisodes(false)}
          animeId={animeId}
          animeTitle={animeTitle}
          scrapedEpisodes={scrapedEpisodesData.scrapedEpisodes}
          failedEpisodes={scrapedEpisodesData.failedEpisodes}
          summary={scrapedEpisodesData.summary}
          onEpisodesAdded={() => {
            // Refresh anime list or show success message
            console.log('Episodes added successfully!');
          }}
        />
      )}
    </div>
  );
};
