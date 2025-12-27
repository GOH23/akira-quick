"use client"

import React, { createContext, useContext, useState, useCallback } from 'react'
import { Locale, getLocale, setLocale, t } from './index'

const LocaleContext = createContext({
  locale: getLocale() as Locale,
  setLocale: (l: Locale) => {}
})

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, _setLocale] = useState<Locale>(getLocale() as Locale)
  const update = (l: Locale) => {
    setLocale(l)
    _setLocale(l)
  }
  return (
    <LocaleContext.Provider value={{ locale, setLocale: update }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}

// Hook that returns a translator function bound to current locale.
// Components that call useTranslation() will re-render when locale changes because
// the hook reads the LocaleContext value.
export function useTranslation() {
  const { locale } = useLocale()
  // useCallback to keep stable identity unless locale changes
  const translate = useCallback((key: string, fallback?: string) => {
    return t(key, fallback)
  }, [locale])
  return translate
}
