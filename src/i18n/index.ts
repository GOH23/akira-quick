import ru from './locales/ru.json'
import en from './locales/en.json'

const LOCALES: Record<string, Record<string, string>> = {
  en,
  ru,
}

export type Locale = 'ru' | 'en'

let current: Locale = 'en'

export function setLocale(l: Locale) {
  current = l
}

export function getLocale() {
  return current
}

export function t(key: string, fallback?: string) {
  const dict = LOCALES[current] || {}
  return dict[key] ?? fallback ?? key
}
