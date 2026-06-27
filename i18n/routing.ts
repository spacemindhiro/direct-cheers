import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ja', 'en'],
  defaultLocale: 'ja',
  // デフォルトロケール(ja)はURLにプレフィックスをつけない
  // /dashboard → ja, /en/dashboard → en
  localePrefix: 'as-needed',
});
