const PREFERENCES_KEY = 'lucent_preferences'
const CHATS_KEY = 'lucent_chats'
const CALENDAR_KEY = 'lucent_calendar_entries'

export function savePreferencesToStorage(preferences) {
  try {
    const payload = {
      persona: preferences.persona || null,
      core_values: preferences.coreValues || '',
      professional: preferences.tone?.professional ?? 3,
      authoritative: preferences.tone?.authoritative ?? 3,
      serious: preferences.tone?.serious ?? 3,
      matterOfFact: preferences.tone?.matterOfFact ?? 3,
      age_min: preferences.ageRange?.[0] ?? 25,
      age_max: preferences.ageRange?.[1] ?? 45,
      income_range: preferences.income || '',
      education_level: preferences.education || '',
      pain_points: preferences.painPoints || '',
      nmls_number: preferences.nmls || '',
    }
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(payload))
  } catch {
    // silent
  }
}

export function loadPreferencesFromStorage() {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw)
    return {
      name: 'Joseph',
      nmls: stored.nmls_number || '',
      persona: stored.persona || null,
      coreValues: stored.core_values || '',
      tone: {
        professional: stored.professional ?? 3,
        authoritative: stored.authoritative ?? 3,
        serious: stored.serious ?? 3,
        matterOfFact: stored.matterOfFact ?? 3,
      },
      ageRange: [
        typeof stored.age_min === 'number' ? stored.age_min : 25,
        typeof stored.age_max === 'number' ? stored.age_max : 45,
      ],
      income: stored.income_range || '',
      education: stored.education_level || '',
      painPoints: stored.pain_points || '',
    }
  } catch {
    return null
  }
}

export function saveChatsToStorage(chats, activeChatId) {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify({ chats, activeChatId }))
  } catch {
    // silent
  }
}

export function loadChatsFromStorage() {
  try {
    const raw = localStorage.getItem(CHATS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Calendar entries store `date` as a Date object in memory, so it has to be serialized to
// an ISO string on the way into localStorage and revived back into a Date on the way out.
export function saveCalendarEntriesToStorage(entries) {
  try {
    const payload = entries.map((entry) => ({ ...entry, date: entry.date.toISOString() }))
    localStorage.setItem(CALENDAR_KEY, JSON.stringify(payload))
  } catch {
    // silent
  }
}

export function loadCalendarEntriesFromStorage() {
  try {
    const raw = localStorage.getItem(CALENDAR_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw)
    if (!Array.isArray(stored)) return null
    return stored.map((entry) => ({ ...entry, date: new Date(entry.date) }))
  } catch {
    return null
  }
}
