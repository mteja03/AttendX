export const DEFAULT_ASSET_TYPES = [
  { name: 'Laptop', mode: 'trackable' },
  { name: 'Desktop', mode: 'trackable' },
  { name: 'Mobile Phone', mode: 'trackable' },
  { name: 'SIM Card', mode: 'consumable' },
  { name: 'Tablet', mode: 'trackable' },
  { name: 'ID Card', mode: 'consumable' },
  { name: 'Access Card', mode: 'consumable' },
  { name: 'Uniform', mode: 'consumable' },
  { name: 'Headset', mode: 'consumable' },
  { name: 'Charger', mode: 'consumable' },
  { name: 'Vehicle', mode: 'trackable' },
  { name: 'Tools', mode: 'trackable' },
  { name: 'Furniture', mode: 'trackable' },
  { name: 'Other', mode: 'trackable' },
];

export const STATUS_OPTIONS = ['All', 'Available', 'Assigned', 'Damaged', 'Lost', 'In Repair', 'Retired'];

export const CONDITION_OPTIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'];

export const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'Available':
      return 'bg-[#C5E8E8] text-[#1B6B6B]';
    case 'Assigned':
      return 'bg-green-100 text-green-700';
    case 'Damaged':
      return 'bg-red-100 text-red-700';
    case 'Lost':
      return 'bg-red-200 text-red-800';
    case 'In Repair':
      return 'bg-amber-100 text-amber-800';
    case 'Retired':
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

export const getAssetIcon = (type) => {
  const icons = {
    Laptop: '💻',
    'Mobile Phone': '📱',
    'SIM Card': '📶',
    Tablet: '📟',
    'ID Card': '🪪',
    'Access Card': '🪪',
    Uniform: '👔',
    Headset: '🎧',
    Charger: '🔌',
    Vehicle: '🚗',
    Tools: '🛠️',
    Furniture: '🪑',
  };
  return icons[type] || '📦';
};

export const getConditionBadgeClass = (condition) => {
  switch (condition) {
    case 'New': return 'bg-[#EAF3DE] text-[#27500A]';
    case 'Good': return 'bg-[#E1F5EE] text-[#0F6E56]';
    case 'Fair': return 'bg-[#FAEEDA] text-[#633806]';
    case 'Poor': return 'bg-[#FCEBEB] text-[#791F1F]';
    case 'Damaged': return 'bg-[#FCEBEB] text-[#791F1F]';
    default: return 'bg-gray-100 text-gray-600';
  }
};

export const getStatusBarColor = (status) => {
  switch (status) {
    case 'Assigned': return '#9FE1CB';
    case 'In Repair': return '#F09595';
    case 'Damaged': return '#F09595';
    case 'Lost': return '#F7C1C1';
    case 'Retired': return '#D3D1C7';
    default: return '#D3D1C7';
  }
};

export const getAssetIdBadgeClass = (status) => {
  switch (status) {
    case 'Assigned': return 'bg-[#E1F5EE] text-[#0F6E56]';
    case 'In Repair': return 'bg-[#FCEBEB] text-[#791F1F]';
    case 'Damaged': return 'bg-[#FCEBEB] text-[#791F1F]';
    case 'Lost': return 'bg-[#FCEBEB] text-[#A32D2D]';
    default: return 'bg-gray-100 text-gray-600';
  }
};

export const getAssetTypeColors = (type) => {
  const map = {
    Laptop: { bg: '#E6F1FB' }, Desktop: { bg: '#EEEDFE' },
    'Mobile Phone': { bg: '#E1F5EE' }, 'SIM Card': { bg: '#EEEDFE' },
    Tablet: { bg: '#E6F1FB' }, 'ID Card': { bg: '#E1F5EE' },
    'Access Card': { bg: '#E1F5EE' }, Uniform: { bg: '#FAEEDA' },
    Headset: { bg: '#FAEEDA' }, Charger: { bg: '#FAEEDA' },
    Vehicle: { bg: '#FCEBEB' }, Tools: { bg: '#F1EFE8' },
    Furniture: { bg: '#F1EFE8' }, Printer: { bg: '#FAEEDA' },
    Scanner: { bg: '#FAEEDA' },
  };
  return map[type] || { bg: '#F1EFE8' };
};

export const buildAssetIdPrefix = (type) => {
  if (!type) return 'AST';
  const map = {
    Laptop: 'LAP',
    Desktop: 'DES',
    'Mobile Phone': 'MOB',
    'SIM Card': 'SIM',
    Tablet: 'TAB',
    'ID Card': 'IDC',
    'Access Card': 'ACC',
    Uniform: 'UNI',
    Headset: 'HED',
    Charger: 'CHR',
    Vehicle: 'VEH',
    Tools: 'TLS',
    Furniture: 'FUR',
  };
  return map[type] || 'AST';
};
