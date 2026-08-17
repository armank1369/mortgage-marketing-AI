// Curated anchor times drawn from PLATFORM_PROMPT's "Best windows" in server/app.py — a small,
// deliberately restrictive set (not every hour in the window) so the calendar save flow can
// offer a locked dropdown instead of a free-form time input, keeping every scheduled post
// within platform algorithm best practices rather than picked arbitrarily.
const RECOMMENDED_POSTING_TIMES = {
  // LinkedIn: Tue 11am-5pm, Wed 11am-4pm, Thu 11am & 1-5pm
  linkedin: ['11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM'],
  // Instagram: Tue 1-7pm, Wed 12-9pm, Mon 2-4pm, Thu 12-2pm
  instagram: ['12:00 PM', '1:00 PM', '3:00 PM', '6:00 PM'],
  // Facebook: Tue & Wed 12-8pm, Mon 12-1pm, Thu 12-2pm & 8pm
  facebook: ['12:00 PM', '1:00 PM', '2:00 PM', '8:00 PM'],
  // TikTok has no explicit "best windows" in PLATFORM_PROMPT (cadence guidance only) — these
  // are general, non-platform-specific reasonable defaults, not a claimed TikTok-specific window.
  tiktok: ['9:00 AM', '12:00 PM', '2:00 PM', '7:00 PM'],
}

const DEFAULT_TIMES = ['10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM']

export function recommendedPostingTimes(platform) {
  const key = (platform || '').toLowerCase()
  return RECOMMENDED_POSTING_TIMES[key] || DEFAULT_TIMES
}

export function bestPostingTime(platform) {
  return recommendedPostingTimes(platform)[0]
}
