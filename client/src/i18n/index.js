import { zhCN } from './locales/zh-CN'
import { enUS } from './locales/en-US'

export const SUPPORTED_LOCALES = {
  'zh-CN': { label: '简体中文', flag: '🇨🇳', messages: zhCN },
  'en-US': { label: 'English', flag: '🇺🇸', messages: enUS },
}

export const DEFAULT_LOCALE = 'zh-CN'

/**
 * 按 key 路径读取翻译，支持 {param} 占位符插值
 * 例如 t('nav.title')  t('calculator.contractInfo', { size: 100, lev: 500, digits: 2 })
 */
function interpolate(template, params) {
  if (!template) return template
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`))
}

function getByPath(obj, path) {
  const parts = path.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

export function createTranslator(messages) {
  return function t(key, params, fallback) {
    const v = getByPath(messages, key)
    if (typeof v === 'string') return interpolate(v, params)
    if (v != null) return v
    // fallback：在 zh-CN 里再找一遍
    const zh = getByPath(SUPPORTED_LOCALES['zh-CN'].messages, key)
    if (typeof zh === 'string') return interpolate(zh, params)
    if (zh != null) return zh
    return fallback ?? key
  }
}
