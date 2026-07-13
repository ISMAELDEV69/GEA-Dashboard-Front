import { NOMINA_FIELD_META } from '../../lib/nominaConsolidadoSchema'

/** Renderiza campos del consolidado según metadata */
export default function NominaFieldGrid({
  fields = [],
  register,
  errors = {},
  control,
  Controller,
  CatalogField,
  catalogProps = {},
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map((key) => {
        const meta = NOMINA_FIELD_META[key]
        if (!meta) return null

        if (meta.type === 'catalog' && CatalogField && control && Controller) {
          const catalogKey = key
          const options = catalogProps[`${catalogKey}Options`] || []
          const onQuickAdd = catalogProps[`${catalogKey}QuickAdd`]
          const adding = catalogProps[`${catalogKey}Adding`]
          return (
            <Controller
              key={key}
              name={key}
              control={control}
              render={({ field }) => (
                <CatalogField
                  label={meta.label}
                  name={key}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onChange}
                  errors={errors}
                  options={options}
                  onQuickAdd={onQuickAdd}
                  adding={adding}
                />
              )}
            />
          )
        }

        if (meta.type === 'select') {
          return (
            <div key={key}>
              <label className="form-label">{meta.label}</label>
              <select {...register(key)} className="form-input">
                <option value="">—</option>
                {meta.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {errors[key] && <p className="form-error">{errors[key].message}</p>}
            </div>
          )
        }

        if (meta.type === 'boolean') {
          return (
            <div key={key} className="flex items-center gap-3 pt-6">
              <input type="checkbox" {...register(key)} id={`nf-${key}`} className="rounded" />
              <label htmlFor={`nf-${key}`} className="form-label mb-0">{meta.label}</label>
            </div>
          )
        }

        if (meta.type === 'textarea') {
          return (
            <div key={key} className="md:col-span-2">
              <label className="form-label">{meta.label}</label>
              <textarea {...register(key)} rows={2} className="form-input resize-y min-h-[60px]" />
            </div>
          )
        }

        const inputType = meta.type === 'date' ? 'date'
          : meta.type === 'integer' ? 'number'
            : meta.type === 'money' ? 'text'
              : meta.type === 'email' ? 'email' : 'text'

        return (
          <div key={key}>
            <label className="form-label">{meta.label}</label>
            <input
              type={inputType}
              step={meta.type === 'integer' ? 1 : undefined}
              {...register(key, meta.type === 'integer' ? { valueAsNumber: true } : undefined)}
              className="form-input"
              placeholder={meta.type === 'money' ? 'Ej. S/1.130,00' : undefined}
            />
            {errors[key] && <p className="form-error">{errors[key].message}</p>}
          </div>
        )
      })}
    </div>
  )
}
