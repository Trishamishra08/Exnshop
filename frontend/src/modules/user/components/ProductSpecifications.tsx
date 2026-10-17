import { useState } from "react";

export interface SpecGroup {
  title: string;
  items: Array<{ label: string; value: string; keySpec: boolean; keyText?: string }>;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Two blocks driven by the product's grouped attributes: a short "Key specs"
 * summary (bullets from the attributes marked as key specs) and the full
 * specification sheet with a pill per section.
 */
export default function ProductSpecifications({ groups, productName }: { groups: SpecGroup[]; productName: string }) {
  const [active, setActive] = useState<string>(groups[0]?.title || "");
  if (!groups.length) return null;

  const keyGroups = groups
    .map((g) => ({ title: g.title, bullets: g.items.filter((i) => i.keySpec && i.keyText).map((i) => i.keyText as string) }))
    .filter((g) => g.bullets.length > 0);

  const goTo = (title: string) => {
    setActive(title);
    document.getElementById(`spec-${slug(title)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mt-4 px-4 md:px-6 lg:px-8 space-y-4" id="product-specifications">
      {keyGroups.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base md:text-lg font-semibold text-neutral-900 border-l-4 border-green-600 pl-2.5">Key specs</h3>
            <button type="button" onClick={() => goTo(groups[0].title)} className="text-xs font-semibold text-green-700 hover:underline">
              See full specs
            </button>
          </div>
          <div className="divide-y divide-neutral-100">
            {keyGroups.map((g) => (
              <div key={g.title} className="py-3 first:pt-0 last:pb-0">
                <h4 className="text-sm font-semibold text-neutral-900 mb-1.5">{g.title}</h4>
                <ul className="space-y-1">
                  {g.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs md:text-sm text-neutral-700">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-neutral-300 shrink-0" />
                      <span className="min-w-0 break-words">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <h3 className="text-base md:text-lg font-semibold text-neutral-900 border-l-4 border-green-600 pl-2.5 mb-3">{productName} specifications</h3>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide" role="tablist" aria-label="Specification sections">
          {groups.map((g) => (
            <button
              key={g.title}
              type="button"
              role="tab"
              aria-selected={active === g.title}
              onClick={() => goTo(g.title)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                active === g.title ? "bg-green-600 border-green-600 text-white" : "bg-neutral-100 border-neutral-200 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {g.title}
            </button>
          ))}
        </div>

        <div className="mt-3 border border-neutral-200 rounded-lg divide-y divide-neutral-200">
          {groups.map((g) => (
            <section key={g.title} id={`spec-${slug(g.title)}`} className="p-3 md:p-4 scroll-mt-24">
              <h4 className="text-sm font-bold text-neutral-900 mb-2">{g.title}</h4>
              <dl className="divide-y divide-neutral-100">
                {g.items.map((i) => (
                  <div key={i.label} className="flex gap-3 py-2 text-xs md:text-sm">
                    <dt className="w-2/5 shrink-0 font-medium text-neutral-500">{i.label}</dt>
                    <dd className="flex-1 min-w-0 text-neutral-900 break-words">{i.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
