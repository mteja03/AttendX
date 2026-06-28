import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const VALUES = [
  {
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
    title: 'Mobile-first',
    desc: '90% of users are on mobile. Every pixel is designed for thumbs, not mice.',
  },
  {
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    title: 'Fast to deploy',
    desc: 'Onboard a company in under 5 minutes. No IT team required.',
  },
  {
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
    title: 'Multi-company',
    desc: 'One platform, many companies. Fully isolated data, shared infrastructure.',
  },
  {
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
    title: 'India-first',
    desc: 'Built for Indian compliance, payroll structures, and working patterns.',
  },
];

const ROLES = [
  { name: 'Admin', desc: 'Platform superadmin' },
  { name: 'Company admin', desc: 'Company owner' },
  { name: 'HR manager', desc: 'HR operations' },
  { name: 'IT manager', desc: 'Assets only' },
  { name: 'Audit manager', desc: 'Audit workflows' },
  { name: 'Auditor', desc: 'Assigned audits' },
];

const TIMELINE = [
  {
    title: 'The problem',
    desc: 'Watched companies manage HR in WhatsApp groups and Excel sheets. There had to be a better way.',
    active: true,
  },
  {
    title: 'The build',
    desc: 'Built AttendX ground-up with React and Firebase — 10+ modules, zero shortcuts, mobile-first always.',
    active: true,
  },
  {
    title: 'First customer',
    desc: 'PPFC/WZ onboarded as the first company. Real data, real feedback, real improvements every week.',
    active: true,
  },
  {
    title: 'Scaling up',
    desc: 'Payroll module, custom domain, and onboarding more companies across India.',
    active: false,
  },
];

export default function AboutPage() {
  useEffect(() => { document.title = 'About — AttendX'; }, []);
  return (
    <>
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 leading-tight mb-3">
          Built for the companies everyone else ignores
        </h1>
        <p className="text-gray-500 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
          Most HR platforms target 500+ employee enterprises. AttendX is built for
          25–200 employee companies that need real infrastructure without enterprise complexity.
        </p>
      </section>

      {/* Values */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {VALUES.map(({ icon, title, desc }) => (
            <div key={title} className="flex gap-3 bg-gray-50 rounded-2xl p-4">
              <div
                className="w-9 h-9 rounded-full bg-[#E1F5EE] flex items-center justify-center shrink-0"
                style={{ color: '#1B6B6B' }}
              >
                {icon}
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-800 mb-0.5">{title}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
        <h2 className="text-lg font-semibold text-gray-900 text-center mb-2">6 built-in roles</h2>
        <p className="text-sm text-gray-400 text-center mb-6">
          Every user sees only what they need — nothing more
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ROLES.map(({ name, desc }) => (
            <div key={name} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
              <div className="text-sm font-medium text-gray-700">{name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section className="max-w-md mx-auto px-4 sm:px-6 pb-12">
        <h2 className="text-lg font-semibold text-gray-900 text-center mb-6">Our journey</h2>
        <div className="space-y-5">
          {TIMELINE.map(({ title, desc, active }, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                  style={{ backgroundColor: active ? '#1B6B6B' : '#639922' }}
                />
                {i < TIMELINE.length - 1 && (
                  <div className="w-px flex-1 bg-gray-200 mt-1" />
                )}
              </div>
              <div className="pb-2">
                <h4 className="text-sm font-medium text-gray-800">{title}</h4>
                <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ backgroundColor: '#1B6B6B' }} className="py-12 text-center">
        <div className="max-w-xl mx-auto px-4">
          <h2 className="text-xl font-semibold text-white mb-2">
            Join the companies choosing better HR
          </h2>
          <p className="text-sm text-white/70 mb-6">Set up your company in minutes.</p>
          <Link
            to="/login"
            className="inline-flex items-center bg-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors min-h-[44px]"
            style={{ color: '#1B6B6B' }}
          >
            Get started
          </Link>
        </div>
      </section>
    </>
  );
}
