import { Component } from 'react';
import { captureError } from '../utils/sentry';
import { isChunkLoadError } from '../utils/chunkErrors';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      isChunkError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      isChunkError: isChunkLoadError(error),
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('AttendX Error:', error, errorInfo);

    try {
      captureError(error, {
        componentStack: errorInfo.componentStack,
        action: 'render',
      });
    } catch {
      // ignore Sentry failures
    }

    if (isChunkLoadError(error)) {
      const lastReload = sessionStorage.getItem('lastChunkReload');
      const now = Date.now();
      if (!lastReload || now - Number(lastReload) > 10000) {
        sessionStorage.setItem('lastChunkReload', String(now));
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        return (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-sm text-center shadow-sm border border-gray-100">
              <div className="text-4xl mb-4">🔄</div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">New version available</h2>
              <p className="text-sm text-gray-500 mb-6">
                AttendX has been updated. Reloading to get the latest version...
              </p>
              <div className="w-8 h-8 border-2 border-[#1B6B6B] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm text-center shadow-sm border border-gray-100">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-500 mb-6">
              An unexpected error occurred. Please reload the page.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858]"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
