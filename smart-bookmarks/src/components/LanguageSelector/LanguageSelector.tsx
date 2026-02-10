import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { type SupportedLanguage, SUPPORTED_LANGUAGES } from '../../i18n/config';
import { clearPromptsCache } from '../../agent-v3/prompts';
import './LanguageSelector.css';

interface Language {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
}

const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
];

// Validate that LANGUAGES array matches SUPPORTED_LANGUAGES
const languageCodes = LANGUAGES.map(l => l.code);
const missingLanguages = SUPPORTED_LANGUAGES.filter(l => !languageCodes.includes(l));
if (missingLanguages.length > 0) {
  console.warn('[LanguageSelector] Missing languages in LANGUAGES array:', missingLanguages);
}

interface LanguageSelectorProps {
  compact?: boolean;
  showFlag?: boolean;
  className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  compact = false,
  showFlag = true,
  className = '',
}) => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);

  const currentLanguage = LANGUAGES.find(lang => lang.code === i18n.language) || LANGUAGES[0];

  const handleLanguageChange = async (languageCode: SupportedLanguage) => {
    await i18n.changeLanguage(languageCode);
    // Clear Agent prompts cache so it reloads with new language
    clearPromptsCache();
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  if (compact) {
    return (
      <button
        className={`language-selector-compact ${className}`}
        onClick={toggleDropdown}
        title={`Language: ${currentLanguage.nativeName}`}
      >
        <Globe size={16} />
        {showFlag && <span className="flag">{currentLanguage.flag}</span>}
      </button>
    );
  }

  return (
    <div className={`language-selector ${className}`}>
      <button
        className="language-selector-trigger"
        onClick={toggleDropdown}
      >
        <Globe size={16} />
        {showFlag && <span className="flag">{currentLanguage.flag}</span>}
        <span className="current-language">{currentLanguage.nativeName}</span>
      </button>

      {isOpen && (
        <div className="language-selector-dropdown">
          <div className="language-selector-list">
            {LANGUAGES.map((language) => (
              <button
                key={language.code}
                className={`language-option ${language.code === i18n.language ? 'active' : ''}`}
                onClick={() => handleLanguageChange(language.code)}
              >
                <span className="flag">{language.flag}</span>
                <div className="language-info">
                  <span className="native-name">{language.nativeName}</span>
                  <span className="english-name">{language.name}</span>
                </div>
                {language.code === i18n.language && (
                  <Check size={16} className="check-icon" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
