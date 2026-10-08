import type { ComponentType } from 'react';
import { TermsV20260627 } from './v2026-06-27';
import { TermsV20261008a } from './v2026-10-08a';
import { TermsV20261008b } from './v2026-10-08b';
import { TermsV20261008c } from './v2026-10-08c';

// 版 → 本文。lib/legal-versions.ts の SERVICE_TERMS_VERSIONS と必ず1対1にすること（テストで検証）
export const SERVICE_TERMS_COMPONENTS: Record<string, ComponentType<{ privacyHref: string }>> = {
  '2026-06-27': TermsV20260627,
  '2026-10-08a': TermsV20261008a,
  '2026-10-08b': TermsV20261008b,
  '2026-10-08c': TermsV20261008c,
};
