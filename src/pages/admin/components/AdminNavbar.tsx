
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCurrentUser, useSignOut } from '../../../hooks/auth/selectors';
import { useNavigation } from '../../../contexts/navigation/NavigationContext';

export default function AdminNavbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const user = useCurrentUser();
  const signOut = useSignOut();
  const { navigateTo } = useNavigation();

  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: 'ri-dashboard-line' },
    { name: 'Anime Management', path: '/admin/anime', icon: 'ri-movie-2-line' },
    { name: 'User Management', path: '/admin/users', icon: 'ri-user-line' },
    { name: 'Content Reports', path: '/admin/reports', icon: 'ri-flag-line' },
    { name: 'Analytics', path: '/admin/analytics', icon: 'ri-bar-chart-line' },
    { name: 'Performance', path: '/admin/performance', icon: 'ri-speed-line' },
    { name: 'Settings', path: '/admin/settings', icon: 'ri-settings-line' }
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      navigateTo('/');
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const handleNavClick = (path: string) => {
    setIsMenuOpen(false);
    navigateTo(path);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Home Button */}
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => navigateTo('/admin')} 
              className="flex items-center space-x-3 cursor-pointer"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <i className="ri-admin-line text-white text-lg"></i>
              </div>
              <span className="text-xl font-bold text-slate-800">Admin Panel</span>
            </button>
            
            {/* Home Button */}
            <button
              onClick={() => navigateTo('/')}
              className="flex items-center space-x-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-all duration-200 cursor-pointer"
              title="Go to Home Page"
            >
              <i className="ri-home-line text-lg"></i>
              <span className="text-sm font-medium hidden sm:block">Home</span>
            </button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  location.pathname === item.path
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <i className={`${item.icon} mr-2`}></i>
                {item.name}
              </button>
            ))}
          </div>

          {/* Admin Profile */}
          <div className="flex items-center space-x-4">
            <button className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors duration-200 cursor-pointer">
              <i className="ri-notification-line text-xl"></i>
            </button>
            
            <div className="flex items-center space-x-3">
              <img
                src={user?.avatar_url || "https://readdy.ai/api/search-image?query=professional%20admin%20avatar%20with%20glasses%20and%20suit%2C%20clean%20background%2C%20corporate%20style%2C%20high%20quality%20portrait&width=40&height=40&seq=admin-profile&orientation=squarish"}
                alt="Admin"
                className="w-8 h-8 rounded-full object-cover object-top"
                width={32}
                height={32}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                }}
              />
              <div className="w-8 h-8 bg-blue-100 rounded-full items-center justify-center hidden">
                <i className="ri-user-line text-blue-600"></i>
              </div>
              <span className="text-sm font-medium text-slate-700 hidden sm:block">
                {user?.username || 'Admin'}
              </span>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={handleSignOut}
              className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200 cursor-pointer"
              title="Sign Out"
            >
              <i className="ri-logout-box-line text-xl"></i>
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors duration-200 cursor-pointer"
            >
              <i className={`ri-${isMenuOpen ? 'close' : 'menu'}-line text-xl`}></i>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="md:hidden py-4 border-t border-slate-200"
          >
            <div className="space-y-2">
              {/* Mobile Home Button */}
              <button
                onClick={() => {
                  navigateTo('/');
                  setIsMenuOpen(false);
                }}
                className="flex items-center w-full px-4 py-3 rounded-lg text-sm font-medium text-green-600 hover:text-green-700 hover:bg-green-50 transition-all duration-200 cursor-pointer"
              >
                <i className="ri-home-line mr-3 text-lg"></i>
                Go to Home Page
              </button>
              
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path)}
                  className={`flex items-center w-full px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                    location.pathname === item.path
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <i className={`${item.icon} mr-3 text-lg`}></i>
                  {item.name}
                </button>
              ))}
              
              {/* Mobile Sign Out */}
              <button
                onClick={handleSignOut}
                className="flex items-center w-full px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-all duration-200 cursor-pointer"
              >
                <i className="ri-logout-box-line mr-3 text-lg"></i>
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </nav>
  );
}
