import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import ja from './locales/ja.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';

// Supported languages constant and type
export const SUPPORTED_LANGUAGES = ['en', 'zh-CN', 'ja', 'es', 'fr', 'de'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

const resources = {
  en: { translation: en },
  'zh-CN': { translation: zhCN },
  ja: { translation: ja },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      // Map browser language codes to supported languages
      convertDetectedLanguage: (lng: string) => {
        // Handle Chinese variants
        if (lng.startsWith('zh')) {
          // zh, zh-CN, zh-Hans -> zh-CN
          // zh-TW, zh-HK, zh-Hant -> fallback to en (or could map to zh-TW if supported)
          if (lng === 'zh' || lng === 'zh-CN' || lng === 'zh-Hans') {
            return 'zh-CN';
          }
          // Traditional Chinese not supported, fall back to English
          return 'en';
        }
        // Handle other language variants (e.g., en-US, en-GB -> en)
        const baseLang = lng.split('-')[0];
        if (SUPPORTED_LANGUAGES.includes(baseLang as SupportedLanguage)) {
          return baseLang;
        }
        // Check if full code is supported
        if (SUPPORTED_LANGUAGES.includes(lng as SupportedLanguage)) {
          return lng;
        }
        // Default to English
        return 'en';
      },
    },
  });

/**
 * Subscribe to language change events
 * @param callback Function to call when language changes
 * @returns Unsubscribe function
 */
export const onLanguageChange = (callback: (lang: SupportedLanguage) => void): (() => void) => {
  i18n.on('languageChanged', callback as (lng: string) => void);
  return () => i18n.off('languageChanged', callback as (lng: string) => void);
};

/**
 * Get the current language, ensuring it's a supported language
 * @returns Current supported language code
 */
export const getCurrentLanguage = (): SupportedLanguage => {
  const lang = i18n.language;
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage) 
    ? (lang as SupportedLanguage)
    : 'en';
};

/**
 * Check if a language code is supported
 * @param lang Language code to check
 * @returns True if the language is supported
 */
export const isSupportedLanguage = (lang: string): lang is SupportedLanguage => {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
};

export default i18n;
