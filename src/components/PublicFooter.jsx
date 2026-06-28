import { Link } from 'react-router-dom';

export default function PublicFooter() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-[#1B6B6B] flex items-center justify-center text-white font-semibold text-xs">
                A
              </div>
              <span className="font-semibold" style={{ color: '#1B6B6B' }}>
                AttendX
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              The HR platform built for growing Indian companies.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Product</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/features" className="text-sm text-gray-400 hover:text-[#1B6B6B] transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-sm text-gray-400 hover:text-[#1B6B6B] transition-colors">
                  About
                </Link>
              </li>
            </ul>
          </div>

          {/* Access */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Access</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/login" className="text-sm text-gray-400 hover:text-[#1B6B6B] transition-colors">
                  Login
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal placeholder */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Legal</h4>
            <ul className="space-y-2">
              <li>
                <span className="text-sm text-gray-300">Privacy policy</span>
              </li>
              <li>
                <span className="text-sm text-gray-300">Terms of service</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-100 mt-8 pt-6 text-center">
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} AttendX. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
