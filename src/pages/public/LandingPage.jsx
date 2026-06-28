import { Link } from 'react-router-dom';

const STATS = [
  { value: '10+', label: 'Modules' },
  { value: '6', label: 'User roles' },
  { value: '90%', label: 'Mobile users' },
  { value: '99.9%', label: 'Uptime' },
];

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    title: 'Employees',
    desc: 'Full profiles, documents, status tracking, and org chart in one view.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    title: 'Leave',
    desc: 'Apply, approve, reject with calendar overlay and balance tracking.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" />
      </svg>
    ),
    title: 'Audits',
    desc: 'Multi-step workflow with GPS verification and selfie capture.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
      </svg>
    ),
    title: 'Assets',
    desc: 'Track laptops, phones, and consumables with QR code scanning.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: 'Reports',
    desc: 'Headcount, leave, asset, and compensation analytics dashboards.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: 'Access control',
    desc: 'Six granular roles — each user sees only what they need.',
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-[#E1F5EE] to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-8 text-center">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900 leading-tight mb-4">
            HR platform built for{' '}
            <span style={{ color: '#1B6B6B' }}>growing companies</span>
          </h1>
          <p className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto mb-8 leading-relaxed">
            Manage employees, leave, assets, audits, and compliance from one place.
            Built for teams that need real HR infrastructure, not spreadsheets.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/login"
              className="bg-[#1B6B6B] text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-[#155858] transition-colors min-h-[44px] flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.841m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              </svg>
              Get started free
            </Link>
            <Link
              to="/features"
              className="border border-[#1B6B6B] text-[#1B6B6B] px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-[#E1F5EE] transition-colors min-h-[44px] flex items-center"
            >
              Explore features
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="max-w-lg mx-auto px-4 pb-8">
          <div className="grid grid-cols-4 gap-4">
            {STATS.map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-xl sm:text-2xl font-semibold" style={{ color: '#1B6B6B' }}>
                  {value}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 text-center mb-2">
          Everything your HR team needs
        </h2>
        <p className="text-sm text-gray-400 text-center mb-10">
          From onboarding to annual audits — one platform, zero spreadsheets
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-[#E1F5EE] flex items-center justify-center mb-3" style={{ color: '#1B6B6B' }}>
                {icon}
              </div>
              <h3 className="text-sm font-medium text-gray-800 mb-1">{title}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mobile-first strip */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
        <div className="bg-gray-50 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
          <div className="w-16 h-24 rounded-2xl border-2 border-gray-200 bg-white flex items-center justify-center shrink-0 relative">
            <svg className="w-7 h-7" style={{ color: '#1B6B6B' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
            </svg>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-1 rounded-full bg-gray-200" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-1">Mobile-first, always</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              90% of AttendX users are on mobile. Every screen, every flow, every button
              is designed for thumbs first, mice second. Your team can manage HR from
              anywhere — no desktop required.
            </p>
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section style={{ backgroundColor: '#1B6B6B' }} className="py-12 sm:py-16 text-center">
        <div className="max-w-xl mx-auto px-4">
          <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">
            Ready to modernize your HR?
          </h2>
          <p className="text-sm text-white/70 mb-6">
            Set up your company in under 5 minutes. No credit card required.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center bg-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors min-h-[44px]"
            style={{ color: '#1B6B6B' }}
          >
            Get started free
          </Link>
        </div>
      </section>
    </>
  );
}
