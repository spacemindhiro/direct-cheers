import { TERMS_LABELS, getTermsSections, type TermsType } from '@/lib/terms';

// 規約種別ごとに、指定バージョンの条文本文を表示する。
// 過去に同意・署名した文書の表示に使うため、必ず保存されたバージョンを渡すこと。
export function TermsText({ types, versions }: { types: TermsType[]; versions: Record<string, string> }) {
  return (
    <div className="space-y-12">
      {types.map((t) => (
        <div key={t} className="space-y-6">
          <p className="text-base font-black text-indigo-400 uppercase tracking-[0.3em]">
            {TERMS_LABELS[t]}　<span className="text-slate-500 tracking-normal normal-case">v{versions[t]}</span>
          </p>
          {getTermsSections(t, versions[t]).map((section) => (
            <div key={section.article} className="space-y-2">
              <p className="text-base font-black text-white">
                {section.article}　{section.title}
              </p>
              <div className="space-y-2">
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-base text-slate-400 leading-relaxed">
                    {section.paragraphs.length > 1 ? `${i + 1}．` : ''}{p}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
