import { useState } from 'react';

const COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-green-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-cyan-500',
];

const SIZES = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
  xxl: 'w-20 h-20 text-2xl',
  huge: 'w-24 h-24 text-3xl',
};

export default function EmployeeAvatar({ employee, size = 'md', className = '', onClick = null }) {
  const [imgError, setImgError] = useState(false);

  const sizeClass = SIZES[size] || SIZES.md;

  const name = employee?.fullName || employee?.name || '';

  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || '?';

  const colorIdx = name.length ? name.charCodeAt(0) % COLORS.length : 0;
  const bgColor = COLORS[colorIdx];

  const showPhoto = !!(employee?.photoURL && !imgError);

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
      className={[
        sizeClass,
        'rounded-full flex-shrink-0 overflow-hidden',
        'flex items-center justify-center',
        'font-semibold text-white select-none',
        showPhoto ? '' : bgColor,
        onClick ? 'cursor-pointer' : '',
        className,
      ]
        .join(' ')
        .trim()}
    >
      {showPhoto ? (
        <img
          src={employee.photoURL}
          alt={name || 'Employee'}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
