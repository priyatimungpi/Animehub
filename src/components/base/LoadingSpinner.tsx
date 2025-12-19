import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'anime' | 'sparkle' | 'pulse';
  text?: string;
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'default',
  text,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  };

  const renderSpinner = () => {
    switch (variant) {
      case 'anime':
        return (
          <div className={`${sizeClasses[size]} relative ${className}`}>
            {/* Anime-style spinning circle with gradient */}
            <div className="absolute inset-0 rounded-full border-4 border-pink-200 border-t-pink-400 animate-spin"></div>
            <div className="absolute inset-1 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}></div>
            <div className="absolute inset-2 rounded-full border border-teal-500 border-t-transparent animate-spin" style={{ animationDuration: '1.2s' }}></div>
          </div>
        );

      case 'sparkle':
        return (
          <div className={`${sizeClasses[size]} relative ${className}`}>
            {/* Sparkle effect */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-pink-400 rounded-full animate-ping"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1 h-1 bg-yellow-400 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping" style={{ animationDelay: '0.4s' }}></div>
            </div>
            {/* Rotating sparkles */}
            <div className="absolute inset-0 animate-spin">
              <div className="absolute top-0 left-1/2 w-1 h-1 bg-pink-300 rounded-full transform -translate-x-1/2"></div>
              <div className="absolute bottom-0 left-1/2 w-1 h-1 bg-yellow-300 rounded-full transform -translate-x-1/2"></div>
              <div className="absolute left-0 top-1/2 w-1 h-1 bg-teal-400 rounded-full transform -translate-y-1/2"></div>
              <div className="absolute right-0 top-1/2 w-1 h-1 bg-pink-300 rounded-full transform -translate-y-1/2"></div>
            </div>
          </div>
        );

      case 'pulse':
        return (
          <div className={`${sizeClasses[size]} relative ${className}`}>
            {/* Pulsing anime-style circles */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-200 to-pink-400 animate-pulse"></div>
            <div className="absolute inset-1 rounded-full bg-gradient-to-r from-yellow-400 to-yellow-300 animate-pulse" style={{ animationDelay: '0.3s' }}></div>
            <div className="absolute inset-2 rounded-full bg-gradient-to-r from-teal-500 to-teal-600 animate-pulse" style={{ animationDelay: '0.6s' }}></div>
          </div>
        );

      default:
        return (
          <div className={`${sizeClasses[size]} ${className}`}>
            <div className="w-full h-full rounded-full border-4 border-pink-200 border-t-pink-400 animate-spin"></div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      {renderSpinner()}
      {text && (
        <p className={`text-teal-600 font-medium ${textSizeClasses[size]} animate-pulse`}>
          {text}
        </p>
      )}
    </div>
  );
};

// Specialized anime loading components
export const AnimeLoadingSpinner: React.FC<Omit<LoadingSpinnerProps, 'variant'>> = (props) => (
  <LoadingSpinner {...props} variant="anime" />
);

export const SparkleLoadingSpinner: React.FC<Omit<LoadingSpinnerProps, 'variant'>> = (props) => (
  <LoadingSpinner {...props} variant="sparkle" />
);

export const PulseLoadingSpinner: React.FC<Omit<LoadingSpinnerProps, 'variant'>> = (props) => (
  <LoadingSpinner {...props} variant="pulse" />
);

export default LoadingSpinner;