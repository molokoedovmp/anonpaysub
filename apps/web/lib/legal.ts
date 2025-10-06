export const LEGAL_NAME = process.env.NEXT_PUBLIC_LEGAL_NAME || 'ИП БАТУЛИН ИЛЬЯ НИКОЛАЕВИЧ'
export const LEGAL_EMAIL = process.env.NEXT_PUBLIC_LEGAL_EMAIL || 'opawkino@mail.ru'
export const LEGAL_ADDRESS = process.env.NEXT_PUBLIC_LEGAL_ADDRESS || '125252, Россия, г. Москва, ул. Гризодубовой, д.2'
export const LEGAL_JURISDICTION = process.env.NEXT_PUBLIC_LEGAL_JURISDICTION || 'Российская Федерация'
export const EFFECTIVE_DATE = process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE || '05.10.2025'
// Prefer public site domain, fallback to server DOMAIN, avoid hardcoded defaults
export const SITE_DOMAIN = (() => {
  const raw = process.env.NEXT_PUBLIC_SITE_DOMAIN || process.env.DOMAIN || ''
  const s = (raw || '').toString().trim()
  return s.replace(/^https?:\/\//i, '').replace(/\/+$/,'')
})()
export const LEGAL_INN = process.env.NEXT_PUBLIC_LEGAL_INN || '771483032370'
export const LEGAL_OGRNIP = process.env.NEXT_PUBLIC_LEGAL_OGRNIP || '324774600328155'
export const LEGAL_BANK = process.env.NEXT_PUBLIC_LEGAL_BANK || 'ПАО Сбербанк'
export const LEGAL_BIK = process.env.NEXT_PUBLIC_LEGAL_BIK || '044525225'
export const LEGAL_ACC = process.env.NEXT_PUBLIC_LEGAL_ACC || '40802 810 3 3800 0432629'
