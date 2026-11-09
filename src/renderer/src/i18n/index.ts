import { createContext, useContext } from 'react'

export type Lang = 'en' | 'he' | 'ru'

const dict = {
  en: {
    appName: 'SMM App',
    nav_home: 'Home', nav_brand: 'Brand profile', nav_plan: 'Content plan', nav_content: 'Create content',
    nav_publish: 'Publishing', nav_analytics: 'Analytics', nav_settings: 'Settings',
    soon: 'Coming in the next stages.',
    home_title: 'Quick generation', home_hint: 'Test the AI: describe what post you need.',
    home_placeholder: 'e.g. An Instagram post for a coffee shop in Tel Aviv announcing a new autumn menu',
    generate: 'Generate', generating: 'Generating…', copy: 'Copy', copied: 'Copied',
    no_key: 'Add an API key in Settings first.',
    settings_title: 'Settings', language: 'Interface language',
    ai_title: 'AI provider', provider: 'Provider', model: 'Model', api_key: 'API key',
    key_saved: 'Key saved (stored encrypted on this computer)', key_none: 'No key yet',
    save_key: 'Save key', remove_key: 'Remove', test: 'Test connection', testing: 'Testing…',
    test_ok: 'Connection works', get_key: 'Where to get a key'
  },
  ru: {
    appName: 'SMM App',
    nav_home: 'Главная', nav_brand: 'Профиль бренда', nav_plan: 'Контент-план', nav_content: 'Создание контента',
    nav_publish: 'Публикация', nav_analytics: 'Аналитика', nav_settings: 'Настройки',
    soon: 'Появится на следующих этапах.',
    home_title: 'Быстрая генерация', home_hint: 'Проверьте AI: опишите, какой пост нужен.',
    home_placeholder: 'Например: пост в Instagram для кофейни в Тель-Авиве о новом осеннем меню',
    generate: 'Сгенерировать', generating: 'Генерирую…', copy: 'Копировать', copied: 'Скопировано',
    no_key: 'Сначала добавьте API-ключ в Настройках.',
    settings_title: 'Настройки', language: 'Язык интерфейса',
    ai_title: 'AI-провайдер', provider: 'Провайдер', model: 'Модель', api_key: 'API-ключ',
    key_saved: 'Ключ сохранён (зашифрован на этом компьютере)', key_none: 'Ключа пока нет',
    save_key: 'Сохранить ключ', remove_key: 'Удалить', test: 'Проверить связь', testing: 'Проверяю…',
    test_ok: 'Связь работает', get_key: 'Где взять ключ'
  },
  he: {
    appName: 'SMM App',
    nav_home: 'ראשי', nav_brand: 'פרופיל מותג', nav_plan: 'תוכנית תוכן', nav_content: 'יצירת תוכן',
    nav_publish: 'פרסום', nav_analytics: 'אנליטיקה', nav_settings: 'הגדרות',
    soon: 'יגיע בשלבים הבאים.',
    home_title: 'יצירה מהירה', home_hint: 'בדקו את ה-AI: תארו איזה פוסט אתם צריכים.',
    home_placeholder: 'למשל: פוסט לאינסטגרם לבית קפה בתל אביב על תפריט סתיו חדש',
    generate: 'צור', generating: 'יוצר…', copy: 'העתק', copied: 'הועתק',
    no_key: 'הוסיפו קודם מפתח API בהגדרות.',
    settings_title: 'הגדרות', language: 'שפת ממשק',
    ai_title: 'ספק AI', provider: 'ספק', model: 'מודל', api_key: 'מפתח API',
    key_saved: 'המפתח נשמר (מוצפן במחשב זה)', key_none: 'אין מפתח עדיין',
    save_key: 'שמור מפתח', remove_key: 'הסר', test: 'בדוק חיבור', testing: 'בודק…',
    test_ok: 'החיבור עובד', get_key: 'איפה משיגים מפתח'
  }
} as const

export type TKey = keyof typeof dict.en
export const translate = (lang: Lang) => (k: TKey) => dict[lang][k] ?? dict.en[k]
export const I18nContext = createContext<(k: TKey) => string>(translate('en'))
export const useT = () => useContext(I18nContext)
