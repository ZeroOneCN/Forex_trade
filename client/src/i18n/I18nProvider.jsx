import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, createTranslator } from './index'

const I18nContext = createContext(null)

const STORAGE_KEY = 'app_locale'

function detectInitialLocale() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && SUPPORTED_LOCALES[saved]) return saved
  const nav = (navigator?.language || DEFAULT_LOCALE).toLowerCase()
  if (nav.startsWith('zh')) return 'zh-CN'
  if (nav.startsWith('en')) return 'en-US'
  return DEFAULT_LOCALE
}

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(detectInitialLocale)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale)
    document.documentElement.lang = locale
  }, [locale])

  const t = useMemo(() => createTranslator(SUPPORTED_LOCALES[locale].messages), [locale])
  const localeInfo = SUPPORTED_LOCALES[locale]

  const value = useMemo(() => ({
    locale,
    setLocale,
    t,
    label: localeInfo.label,
    flag: localeInfo.flag,
    locales: Object.entries(SUPPORTED_LOCALES).map(([code, info]) => ({
      code,
      label: info.label,
      flag: info.flag,
    })),
  }), [locale, t, localeInfo])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

/** 快捷翻译 Hook：返回 t 函数 + locale info */
export function useTranslation() {
  const { t, locale, setLocale, locales } = useI18n()
  return { t, locale, setLocale, locales }
}
