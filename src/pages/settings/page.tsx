
import { useState } from 'react';
import { motion } from 'framer-motion';
import Navbar from '../../components/feature/Navbar';
import Footer from '../../components/feature/Footer';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    // Display Settings
    theme: 'light',
    language: 'en',
    autoplay: true,
    quality: 'auto',
    subtitles: true,
    
    // Notification Settings
    newEpisodes: true,
    recommendations: true,
    systemUpdates: false,
    emailNotifications: true,
    
    // Privacy Settings
    profileVisibility: 'public',
    watchHistoryVisible: true,
    allowRecommendations: true,
    
    // Playback Settings
    skipIntro: true,
    skipOutro: false,
    continuousPlay: true,
    volume: 80
  });

  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const settingSections = [
    {
      title: 'Display & Playback',
      icon: 'ri-tv-line',
      settings: [
        {
          key: 'theme',
          label: 'Theme',
          type: 'select',
          options: [
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'auto', label: 'Auto' }
          ]
        },
        {
          key: 'language',
          label: 'Language',
          type: 'select',
          options: [
            { value: 'en', label: 'English' },
            { value: 'ja', label: '日本語' },
            { value: 'ko', label: '한국어' },
            { value: 'zh', label: '中文' }
          ]
        },
        {
          key: 'quality',
          label: 'Default Video Quality',
          type: 'select',
          options: [
            { value: 'auto', label: 'Auto' },
            { value: '1080p', label: '1080p' },
            { value: '720p', label: '720p' },
            { value: '480p', label: '480p' }
          ]
        },
        {
          key: 'autoplay',
          label: 'Autoplay next episode',
          type: 'toggle'
        },
        {
          key: 'subtitles',
          label: 'Show subtitles by default',
          type: 'toggle'
        },
        {
          key: 'skipIntro',
          label: 'Skip intro automatically',
          type: 'toggle'
        },
        {
          key: 'skipOutro',
          label: 'Skip outro automatically',
          type: 'toggle'
        },
        {
          key: 'continuousPlay',
          label: 'Continuous play',
          type: 'toggle'
        },
        {
          key: 'volume',
          label: 'Default Volume',
          type: 'slider',
          min: 0,
          max: 100
        }
      ]
    },
    {
      title: 'Notifications',
      icon: 'ri-notification-line',
      settings: [
        {
          key: 'newEpisodes',
          label: 'New episode notifications',
          type: 'toggle'
        },
        {
          key: 'recommendations',
          label: 'Recommendation notifications',
          type: 'toggle'
        },
        {
          key: 'systemUpdates',
          label: 'System update notifications',
          type: 'toggle'
        },
        {
          key: 'emailNotifications',
          label: 'Email notifications',
          type: 'toggle'
        }
      ]
    },
    {
      title: 'Privacy & Security',
      icon: 'ri-shield-line',
      settings: [
        {
          key: 'profileVisibility',
          label: 'Profile Visibility',
          type: 'select',
          options: [
            { value: 'public', label: 'Public' },
            { value: 'friends', label: 'Friends Only' },
            { value: 'private', label: 'Private' }
          ]
        },
        {
          key: 'watchHistoryVisible',
          label: 'Show watch history to others',
          type: 'toggle'
        },
        {
          key: 'allowRecommendations',
          label: 'Allow personalized recommendations',
          type: 'toggle'
        }
      ]
    }
  ];

  const renderSetting = (setting: any) => {
    switch (setting.type) {
      case 'toggle':
        return (
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings[setting.key as keyof typeof settings]}
              onChange={(e) => handleSettingChange(setting.key, e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
          </label>
        );

      case 'select':
        return (
          <select
            value={settings[setting.key as keyof typeof settings]}
            onChange={(e) => handleSettingChange(setting.key, e.target.value)}
            className="px-3 py-2 bg-white border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent pr-8"
          >
            {setting.options.map((option: any) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'slider':
        return (
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={setting.min}
              max={setting.max}
              value={settings[setting.key as keyof typeof settings]}
              onChange={(e) => handleSettingChange(setting.key, parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <span className="text-sm text-teal-600 min-w-[3rem] text-right">
              {settings[setting.key as keyof typeof settings]}%
            </span>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-blue-50">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-teal-800 mb-2">Settings</h1>
          <p className="text-teal-600">Customize your AnimeStream experience</p>
        </motion.div>

        {/* Settings Sections */}
        <div className="space-y-8">
          {settingSections.map((section, sectionIndex) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sectionIndex * 0.1 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl shadow-sm border border-green-200 overflow-hidden"
            >
              {/* Section Header */}
              <div className="px-6 py-4 border-b border-green-200 bg-gradient-to-r from-teal-50 to-green-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                    <i className={`${section.icon} text-teal-600`}></i>
                  </div>
                  <h2 className="text-xl font-semibold text-teal-800">{section.title}</h2>
                </div>
              </div>

              {/* Section Settings */}
              <div className="p-6">
                <div className="space-y-6">
                  {section.settings.map((setting, settingIndex) => (
                    <motion.div
                      key={setting.key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: (sectionIndex * 0.1) + (settingIndex * 0.05) }}
                      className="flex items-center justify-between py-3"
                    >
                      <div className="flex-1">
                        <label className="text-sm font-medium text-teal-800">
                          {setting.label}
                        </label>
                      </div>
                      <div className="flex-shrink-0">
                        {renderSetting(setting)}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 flex gap-4"
        >
          <button className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors duration-200 whitespace-nowrap cursor-pointer">
            Save Changes
          </button>
          <button className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors duration-200 whitespace-nowrap cursor-pointer">
            Reset to Default
          </button>
        </motion.div>

        {/* Account Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-12 bg-white/80 backdrop-blur-sm rounded-xl shadow-sm border border-red-200 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-red-200 bg-gradient-to-r from-red-50 to-pink-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <i className="ri-alert-line text-red-600"></i>
              </div>
              <h2 className="text-xl font-semibold text-red-800">Danger Zone</h2>
            </div>
          </div>
          
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3">
                <div>
                  <h3 className="text-sm font-medium text-red-800">Export Data</h3>
                  <p className="text-sm text-red-600">Download all your data including watchlist and preferences</p>
                </div>
                <button className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors duration-200 whitespace-nowrap cursor-pointer">
                  Export
                </button>
              </div>
              
              <div className="flex items-center justify-between py-3">
                <div>
                  <h3 className="text-sm font-medium text-red-800">Delete Account</h3>
                  <p className="text-sm text-red-600">Permanently delete your account and all associated data</p>
                </div>
                <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 whitespace-nowrap cursor-pointer">
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
}
