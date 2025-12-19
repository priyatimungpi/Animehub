import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AdminService, type UserManagement } from '../../../services/admin';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserManagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterSubscription, setFilterSubscription] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserManagement | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const fetchUsers = async (page: number = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await AdminService.getAllUsers(page, 20);
      setUsers(result.users);
      setTotalUsers(result.total);
      setCurrentPage(page);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: 'user' | 'moderator' | 'admin') => {
    try {
      setUpdatingUser(userId);
      setError(null);
      setSuccessMessage(null);
      
      await AdminService.updateUserRole(userId, newRole);
      await fetchUsers(currentPage);
      
      setSuccessMessage(`User role updated to ${newRole} successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to update user role:', err);
      setError(err instanceof Error ? err.message : 'Failed to update user role');
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleSubscriptionChange = async (userId: string, newSubscription: 'free' | 'premium' | 'vip') => {
    try {
      setUpdatingUser(userId);
      setError(null);
      setSuccessMessage(null);
      
      await AdminService.updateUserSubscription(userId, newSubscription);
      await fetchUsers(currentPage);
      
      setSuccessMessage(`User subscription updated to ${newSubscription} successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to update subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to update subscription');
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      try {
        setUpdatingUser(userId);
        setError(null);
        setSuccessMessage(null);
        
        await AdminService.deleteUser(userId);
        await fetchUsers(currentPage);
        
        setSuccessMessage(`User "${username}" deleted successfully!`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        console.error('Failed to delete user:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete user');
      } finally {
        setUpdatingUser(null);
      }
    }
  };

  const handleViewProfile = (user: UserManagement) => {
    setSelectedUser(user);
    setShowProfileModal(true);
  };

  const closeProfileModal = () => {
    setShowProfileModal(false);
    setSelectedUser(null);
  };

  const filteredUsers = users.filter(user => {
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesSubscription = filterSubscription === 'all' || user.subscription_type === filterSubscription;
    const matchesSearch = searchTerm === '' || 
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesRole && matchesSubscription && matchesSearch;
  });

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-800';
      case 'moderator': return 'bg-blue-100 text-blue-800';
      case 'user': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSubscriptionColor = (subscription: string) => {
    switch (subscription) {
      case 'vip': return 'bg-gradient-to-r from-purple-100 to-pink-100 text-purple-800';
      case 'premium': return 'bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800';
      case 'free': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return '👑';
      case 'moderator': return '🛡️';
      case 'user': return '👤';
      default: return '👤';
    }
  };

  const getSubscriptionIcon = (type: string) => {
    switch (type) {
      case 'vip': return '💎';
      case 'premium': return '⭐';
      case 'free': return '🆓';
      default: return '🆓';
    }
  };

    return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="mt-2 text-gray-600">Manage user accounts, roles, and subscriptions</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 text-lg">👥</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Users</p>
                <p className="text-2xl font-bold text-gray-900">{totalUsers}</p>
              </div>
        </div>
      </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="text-purple-600 text-lg">👑</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Admins</p>
                <p className="text-2xl font-bold text-gray-900">
                  {users.filter(u => u.role === 'admin').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <span className="text-yellow-600 text-lg">⭐</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Premium Users</p>
                <p className="text-2xl font-bold text-gray-900">
                  {users.filter(u => u.subscription_type !== 'free').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-green-600 text-lg">📈</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Active Users</p>
                <p className="text-2xl font-bold text-gray-900">
                  {users.filter(u => u.total_watch_time && u.total_watch_time > 0).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-6">
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
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
                Search Users
              </label>
              <input
                type="text"
                id="search"
                placeholder="Search by username or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Role Filter */}
            <div>
              <label htmlFor="roleFilter" className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Role
              </label>
              <select
                id="roleFilter"
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
                <option value="user">User</option>
              </select>
            </div>

            {/* Subscription Filter */}
            <div>
              <label htmlFor="subscriptionFilter" className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Subscription
              </label>
              <select
                id="subscriptionFilter"
                value={filterSubscription}
                onChange={(e) => setFilterSubscription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Subscriptions</option>
                <option value="vip">VIP</option>
                <option value="premium">Premium</option>
                <option value="free">Free</option>
              </select>
            </div>
          </div>
        </div>

        {/* Users List */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <motion.div
                      key={user.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                            {user.avatar_url ? (
                              <img
                                className="h-16 w-16 rounded-full object-cover border-2 border-gray-200"
                                src={user.avatar_url}
                                alt={user.username}
                                width={64}
                                height={64}
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center border-2 border-gray-200">
                          <span className="text-white text-2xl font-bold">
                            {user.username.charAt(0).toUpperCase()}
                          </span>
                              </div>
                            )}
                          </div>

                    {/* User Info */}
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-xl font-semibold text-gray-900">{user.username}</h3>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleColor(user.role)}`}>
                          {getRoleIcon(user.role)} {user.role}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getSubscriptionColor(user.subscription_type)}`}>
                          {getSubscriptionIcon(user.subscription_type)} {user.subscription_type}
                        </span>
                      </div>
                      
                      <p className="text-gray-600 mb-3">{user.email}</p>
                      
                      <div className="flex items-center space-x-6 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                          <span>📅</span>
                          <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
                            </div>
                        
                        <div className="flex items-center space-x-1">
                          <span>⏱️</span>
                          <span>
                            {user.total_watch_time && user.total_watch_time > 0 
                              ? `${Math.round(user.total_watch_time / 3600)}h watched`
                              : 'No watch time'
                            }
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-1">
                          <span>🎬</span>
                          <span>
                            {user.anime_watched && user.anime_watched > 0 
                              ? `${user.anime_watched} anime`
                              : 'No anime watched'
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col space-y-3">
                    {/* Role Change */}
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium text-gray-700">Role:</label>
                      {user.role === 'admin' ? (
                        <div className="flex items-center space-x-2">
                          <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-md text-sm font-medium">
                            👑 Admin (Protected)
                          </span>
                          <span className="text-xs text-gray-500">Cannot be changed</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as any)}
                            disabled={updatingUser === user.id}
                            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                        >
                          <option value="user">User</option>
                          <option value="moderator">Moderator</option>
                            <option value="admin" disabled>Admin (Database Only)</option>
                        </select>
                          {updatingUser === user.id && (
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Subscription Change */}
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium text-gray-700">Plan:</label>
                      <div className="flex items-center space-x-2">
                        <select
                          value={user.subscription_type}
                          onChange={(e) => handleSubscriptionChange(user.id, e.target.value as any)}
                          disabled={updatingUser === user.id}
                          className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                        >
                          <option value="free">Free</option>
                          <option value="premium">Premium</option>
                          <option value="vip">VIP</option>
                        </select>
                        {updatingUser === user.id && (
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        )}
                      </div>
                        </div>

                    {/* Action Buttons */}
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleViewProfile(user)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        View Profile
                      </button>
                      {user.role === 'admin' ? (
                        <button
                          disabled
                          className="px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed text-sm opacity-50"
                          title="Admin users cannot be deleted"
                        >
                          Delete (Protected)
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          disabled={updatingUser === user.id}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                        >
                          {updatingUser === user.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            
            {filteredUsers.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">👥</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
                <p className="text-gray-500">
                  {searchTerm || filterRole !== 'all' || filterSubscription !== 'all'
                    ? 'No users match your current filters.'
                    : 'There are no users to display.'
                  }
                </p>
              </div>
            )}
            </div>
        )}

            {/* Pagination */}
        {totalUsers > 20 && (
          <div className="mt-8 flex justify-center">
            <div className="flex space-x-2">
              <button
                onClick={() => fetchUsers(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
              </button>
              
              <span className="px-4 py-2 text-gray-700">
                Page {currentPage} of {Math.ceil(totalUsers / 20)}
                </span>
              
              <button
                onClick={() => fetchUsers(currentPage + 1)}
                disabled={currentPage >= Math.ceil(totalUsers / 20)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {showProfileModal && selectedUser && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-pink-900/20 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">User Profile</h2>
              <button
                onClick={closeProfileModal}
                className="text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="flex items-start space-x-6 mb-6">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {selectedUser.avatar_url ? (
                    <div className="relative">
                      <img
                        className="h-24 w-24 rounded-full object-cover border-4 border-white/30 shadow-xl"
                        src={selectedUser.avatar_url}
                        alt={selectedUser.username}
                      />
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 to-transparent"></div>
                    </div>
                  ) : (
                    <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-400/80 to-purple-500/80 backdrop-blur-sm flex items-center justify-center border-4 border-white/30 shadow-xl">
                      <span className="text-white text-3xl font-bold drop-shadow-lg">
                        {selectedUser.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* User Info */}
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <h3 className="text-2xl font-bold text-white drop-shadow-lg">{selectedUser.username}</h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm border border-white/20 ${getRoleColor(selectedUser.role)}`}>
                      {getRoleIcon(selectedUser.role)} {selectedUser.role}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm border border-white/20 ${getSubscriptionColor(selectedUser.subscription_type)}`}>
                      {getSubscriptionIcon(selectedUser.subscription_type)} {selectedUser.subscription_type}
                    </span>
                  </div>
                  
                  <p className="text-white/80 text-lg mb-4 drop-shadow-sm">{selectedUser.email}</p>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <span className="text-white/70">📅</span>
                      <span className="text-white/90">Joined {new Date(selectedUser.created_at).toLocaleDateString()}</span>
                    </div>
                    
                    <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <span className="text-white/70">⏱️</span>
                      <span className="text-white/90">
                        {selectedUser.total_watch_time && selectedUser.total_watch_time > 0 
                          ? `${Math.round(selectedUser.total_watch_time / 3600)}h watched`
                          : 'No watch time recorded'
                        }
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <span className="text-white/70">🎬</span>
                      <span className="text-white/90">
                        {selectedUser.anime_watched && selectedUser.anime_watched > 0 
                          ? `${selectedUser.anime_watched} anime watched`
                          : 'No anime watched yet'
                        }
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <span className="text-white/70">🆔</span>
                      <span className="font-mono text-xs text-white/90">{selectedUser.id}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="border-t border-white/10 pt-6">
                <h4 className="text-lg font-semibold text-white drop-shadow-lg mb-4">Quick Actions</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {selectedUser.role !== 'admin' && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/80">Change Role</label>
                      <select
                        value={selectedUser.role}
                        onChange={(e) => {
                          handleRoleChange(selectedUser.id, e.target.value as any);
                          setSelectedUser({...selectedUser, role: e.target.value as any});
                        }}
                        disabled={updatingUser === selectedUser.id}
                        className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/30 disabled:opacity-50"
                      >
                        <option value="user" className="bg-gray-800 text-white">User</option>
                        <option value="moderator" className="bg-gray-800 text-white">Moderator</option>
                        <option value="admin" disabled className="bg-gray-800 text-white">Admin (Database Only)</option>
                      </select>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-white/80">Change Subscription</label>
                    <select
                      value={selectedUser.subscription_type}
                      onChange={(e) => {
                        handleSubscriptionChange(selectedUser.id, e.target.value as any);
                        setSelectedUser({...selectedUser, subscription_type: e.target.value as any});
                      }}
                      disabled={updatingUser === selectedUser.id}
                      className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/30 disabled:opacity-50"
                    >
                      <option value="free" className="bg-gray-800 text-white">Free</option>
                      <option value="premium" className="bg-gray-800 text-white">Premium</option>
                      <option value="vip" className="bg-gray-800 text-white">VIP</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-white/80">Actions</label>
                    <div className="flex space-x-2">
                      {selectedUser.role !== 'admin' && (
                        <button
                          onClick={() => {
                            handleDeleteUser(selectedUser.id, selectedUser.username);
                            closeProfileModal();
                          }}
                          disabled={updatingUser === selectedUser.id}
                          className="px-4 py-2 bg-red-500/80 backdrop-blur-sm text-white rounded-lg hover:bg-red-600/80 disabled:opacity-50 transition-all duration-200 border border-red-400/30 hover:border-red-400/50"
                        >
                          Delete User
                        </button>
                      )}
                      <button
                        onClick={closeProfileModal}
                        className="px-4 py-2 bg-white/10 backdrop-blur-sm text-white rounded-lg hover:bg-white/20 transition-all duration-200 border border-white/20 hover:border-white/30"
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
    </div>
  );
}