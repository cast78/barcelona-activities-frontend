import { useTranslation } from 'react-i18next';

export type TFunc = (key: string, options?: Record<string, unknown>) => string;

export interface I18nInstance {
  language: string;
  changeLanguage: (lng: string) => Promise<unknown>;
}

export function useT(): TFunc {
  const { t } = useTranslation();
  return t as unknown as TFunc;
}

export function useLanguage(): I18nInstance {
  const { i18n } = useTranslation();
  return i18n as unknown as I18nInstance;
}
