// Best-practice posting windows, matching the same per-platform guidance the backend already
// gives the AI when it builds a full content calendar (see PLATFORM_PROMPT in server/app.py) —
// a representative time picked from within each platform's recommended window, kept in sync
// so a single saved post lines up with the same logic a generated 2-week calendar would use.
const BEST_POSTING_TIMES = {
  linkedin: '11:00 AM', // within Tue 11am-5pm / Wed 11am-4pm / Thu 11am windows
  instagram: '1:00 PM', // within Tue 1-7pm / Wed 12-9pm windows
  facebook: '12:00 PM', // within Tue & Wed 12-8pm / Thu 12-2pm windows
  tiktok: '7:00 PM', // evening — TikTok engagement skews after work/school hours
}

const DEFAULT_TIME = '10:00 AM'

export function bestPostingTime(platform) {
  if (!platform) return DEFAULT_TIME
  return BEST_POSTING_TIMES[platform.toLowerCase()] || DEFAULT_TIME
}
