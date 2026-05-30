import { useState, useMemo } from 'react';
import { effStatus, getAuditScore } from './auditHelpers';

export function BranchScoreChart({ audits }) {
  const [selectedTypeId, setSelectedTypeId] = useState('');

  const templateOptions = useMemo(() => {
    const map = {};
    (audits || []).forEach((a) => {
      if (a.auditTypeId && a.auditTypeName && !map[a.auditTypeId]) {
        map[a.auditTypeId] = a.auditTypeName;
      }
    });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [audits]);

  const activeId = selectedTypeId || templateOptions[0]?.id || '';

  const branchScores = useMemo(() => {
    const closed = (audits || []).filter(
      (a) => effStatus(a.status) === 'Closed' && (templateOptions.length === 0 || a.auditTypeId === activeId),
    );
    const map = {};
    closed.forEach((a) => {
      const branch = a.branch || a.location || '—';
      const score = getAuditScore(a);
      if (score === null) return;
      if (!map[branch]) map[branch] = { total: 0, count: 0 };
      map[branch].total += score;
      map[branch].count += 1;
    });
    return Object.entries(map)
      .map(([branch, { total, count }]) => ({ branch, avg: Math.round(total / count), count }))
      .sort((a, b) => b.avg - a.avg);
  }, [audits, activeId, templateOptions]);

  if (branchScores.length === 0) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-5">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-700">Branch score comparison</p>
          <p className="text-xs text-gray-400 mt-0.5">Average compliance score across branches for closed audits</p>
        </div>
        <select
          value={activeId}
          onChange={(e) => setSelectedTypeId(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-[#1B6B6B] bg-white flex-shrink-0"
        >
          {templateOptions.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2.5">
        {branchScores.map(({ branch, avg, count }) => {
          const barColor = avg >= 80 ? '#639922' : avg >= 60 ? '#EF9F27' : '#E24B4A';
          const textColor = avg >= 80 ? '#EAF3DE' : '#fff';
          return (
            <div key={branch} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-28 sm:w-36 flex-shrink-0 truncate" title={branch}>{branch}</span>
              <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden">
                <div
                  className="h-full flex items-center px-2.5 rounded-lg transition-all duration-500"
                  style={{ width: `${Math.max(avg, 8)}%`, background: barColor, minWidth: '36px' }}
                >
                  <span className="text-xs font-medium" style={{ color: textColor }}>{avg}%</span>
                </div>
              </div>
              <span className="text-xs text-gray-400 w-14 text-right flex-shrink-0">{count} audit{count !== 1 ? 's' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LocationScoreChart({ audits }) {
  const [selectedTypeId, setSelectedTypeId] = useState('');

  const templateOptions = useMemo(() => {
    const map = {};
    (audits || []).forEach((a) => {
      if (a.auditTypeId && a.auditTypeName && !map[a.auditTypeId]) {
        map[a.auditTypeId] = a.auditTypeName;
      }
    });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [audits]);

  const activeId = selectedTypeId || templateOptions[0]?.id || '';

  const locationScores = useMemo(() => {
    const closed = (audits || []).filter(
      (a) => effStatus(a.status) === 'Closed' && (templateOptions.length === 0 || a.auditTypeId === activeId),
    );
    const map = {};
    closed.forEach((a) => {
      const location = a.location || '—';
      const score = getAuditScore(a);
      if (score === null) return;
      if (!map[location]) map[location] = { total: 0, count: 0 };
      map[location].total += score;
      map[location].count += 1;
    });
    return Object.entries(map)
      .map(([location, { total, count }]) => ({ location, avg: Math.round(total / count), count }))
      .sort((a, b) => b.avg - a.avg);
  }, [audits, activeId, templateOptions]);

  if (locationScores.length === 0) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-5">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-700">Location score comparison</p>
          <p className="text-xs text-gray-400 mt-0.5">Average compliance score across locations for closed audits</p>
        </div>
        <select
          value={activeId}
          onChange={(e) => setSelectedTypeId(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-[#1B6B6B] bg-white flex-shrink-0"
        >
          {templateOptions.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2.5">
        {locationScores.map(({ location, avg, count }) => {
          const barColor = avg >= 80 ? '#639922' : avg >= 60 ? '#EF9F27' : '#E24B4A';
          const textColor = avg >= 80 ? '#EAF3DE' : '#fff';
          return (
            <div key={location} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-28 sm:w-36 flex-shrink-0 truncate" title={location}>{location}</span>
              <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden">
                <div
                  className="h-full flex items-center px-2.5 rounded-lg transition-all duration-500"
                  style={{ width: `${Math.max(avg, 8)}%`, background: barColor, minWidth: '36px' }}
                >
                  <span className="text-xs font-medium" style={{ color: textColor }}>{avg}%</span>
                </div>
              </div>
              <span className="text-xs text-gray-400 w-14 text-right flex-shrink-0">{count} audit{count !== 1 ? 's' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
