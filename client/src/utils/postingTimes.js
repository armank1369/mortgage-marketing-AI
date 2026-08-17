// Per-platform, per-weekday posting windows (24h hours), transcribed directly from
// PLATFORM_PROMPT's "Best windows" text in server/app.py — the same guidance already given to
// the model, so the calendar picker and the AI aren't citing two different opinions.
// Date.getDay() keys: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat.
//
// LinkedIn Thu is actually two segments ("11am & 1-5pm"), not one continuous block — using the
// outer bound [11, 17] here is a deliberate simplification (a single-range time picker isn't
// worth modeling multi-segment days for); same for Facebook Thu ("12-2pm & 8pm").
const PLATFORM_WINDOWS = {
  linkedin: {
    2: [11, 17], // Tue 11am-5pm
    3: [11, 16], // Wed 11am-4pm
    4: [11, 17], // Thu 11am & 1-5pm (outer bound)
  },
  instagram: {
    1: [14, 16], // Mon 2-4pm
    2: [13, 19], // Tue 1-7pm
    3: [12, 21], // Wed 12-9pm
    4: [12, 14], // Thu 12-2pm
  },
  facebook: {
    1: [12, 13], // Mon 12-1pm
    2: [12, 20], // Tue 12-8pm
    3: [12, 20], // Wed 12-8pm
    4: [12, 20], // Thu 12-2pm & 8pm (outer bound)
  },
}

// Used whenever a platform/day has no explicit PLATFORM_PROMPT guidance — weekends (explicitly
// "avoid" for LinkedIn/Instagram/Facebook, but not blocked outright here, just not claimed as
// optimal), any weekday not called out above, and TikTok generally (PLATFORM_PROMPT gives it no
// explicit time window, only a posting-cadence recommendation). General business hours, not a
// platform-specific claim.
const FALLBACK_WINDOW = [9, 17]

const STEP_MINUTES = 30

function formatHourMinute(hour, minute) {
  const period = hour < 12 ? 'AM' : 'PM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

// Returns every on-the-half-hour time within that platform+day's recommended window — a real
// range (e.g. 13 options for a 6-hour window), not a handful of fixed anchor points, so pairs
// with conflict-checking against existing calendar entries at the call site.
export function recommendedPostingTimes(platform, date) {
  const key = (platform || '').toLowerCase()
  const dayOfWeek = date instanceof Date ? date.getDay() : null
  const windows = PLATFORM_WINDOWS[key]
  const [startHour, endHour] = (windows && dayOfWeek != null && windows[dayOfWeek]) || FALLBACK_WINDOW

  const options = []
  for (let minutes = startHour * 60; minutes <= endHour * 60; minutes += STEP_MINUTES) {
    options.push(formatHourMinute(Math.floor(minutes / 60), minutes % 60))
  }
  return options
}

export function bestPostingTime(platform, date) {
  return recommendedPostingTimes(platform, date)[0]
}
