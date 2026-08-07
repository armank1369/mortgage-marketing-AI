const PLATFORM_BADGES = {
  linkedin: { label: 'in', className: 'bg-blue-600 text-white' },
  instagram: { label: '📷', className: 'bg-gradient-to-br from-pink-500 to-orange-400 text-white' },
  facebook: { label: 'f', className: 'bg-indigo-600 text-white' },
  tiktok: { label: '♪', className: 'bg-slate-900 text-white' },
}

const PLATFORM_GRADIENTS = {
  linkedin: 'bg-gradient-to-r from-blue-600 to-blue-400',
  instagram: 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400',
  facebook: 'bg-gradient-to-r from-indigo-600 to-indigo-400',
  tiktok: 'bg-gradient-to-r from-slate-900 to-slate-600',
}

export default function platformBadge(platform) {
  const key = (platform || '').toLowerCase()
  return PLATFORM_BADGES[key] || { label: (platform || '?')[0]?.toUpperCase() || '?', className: 'bg-slate-500 text-white' }
}

export function platformGradient(platform) {
  const key = (platform || '').toLowerCase()
  return PLATFORM_GRADIENTS[key] || 'bg-gradient-to-r from-slate-400 to-slate-300'
}
