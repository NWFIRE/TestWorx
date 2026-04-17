import { formatManualDocumentType, manualDocumentTypes } from "@testworx/lib";

export function ManualFilters({
  manufacturer,
  model,
  documentType,
  manufacturers,
  models,
  favoritesOnly,
  activeOnly
}: {
  manufacturer?: string;
  model?: string;
  documentType?: string;
  manufacturers: string[];
  models: string[];
  favoritesOnly?: boolean;
  activeOnly?: boolean;
}) {
  return (
    <section className="rounded-[24px] border border-[color:rgb(203_215_230_/_0.92)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" defaultValue={manufacturer ?? ""} name="manufacturer">
          <option value="">All manufacturers</option>
          {manufacturers.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" defaultValue={model ?? ""} name="model">
          <option value="">All models</option>
          {models.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" defaultValue={documentType ?? ""} name="documentType">
          <option value="">All document types</option>
          {manualDocumentTypes.map((item) => (
            <option key={item} value={item}>
              {formatManualDocumentType(item)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input defaultChecked={favoritesOnly} name="favoritesOnly" type="checkbox" />
          Favorites only
        </label>
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input defaultChecked={activeOnly} name="activeOnly" type="checkbox" />
          Active only
        </label>
      </div>
    </section>
  );
}
