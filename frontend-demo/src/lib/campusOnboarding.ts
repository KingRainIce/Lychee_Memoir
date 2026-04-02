const KEY = 'szu_memoir_campus_chosen'

export function hasCompletedCampusOnboarding(): boolean {
  return localStorage.getItem(KEY) === '1'
}

export function markCampusOnboardingDone(): void {
  localStorage.setItem(KEY, '1')
}
