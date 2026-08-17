// Mirrors the same best-practice posting windows given to the backend model (see
// PLATFORM_PROMPT in server/app.py) — used to default the time on a manually "Saved to
// Calendar" single post, which has no time of its own the way a generated calendar entry does.
const BEST_POSTING_TIMES = {
  linkedin: '11:00 AM',
  instagram: '1:00 PM',
  facebook: '12:00 PM',
  tiktok: '2:00 PM',
}

export function bestPostingTime(platform) {
  const key = (platform || '').toLowerCase()
  return BEST_POSTING_TIMES[key] || '10:00 AM'
}
