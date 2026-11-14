import { useEffect } from 'react'
import { MONTHS, periodStats } from '../types'
import { formatCOP } from '../money'
import { useStore } from '../store'
import { goPeriod } from '../route'
export function YearView({ year, onYear }: { year: number; onYear: (year: number) => void }) {
  const store = useStore()
  const periods = store.db.periods.filter((p) => p.year === year).sort((a, b) => a.sortOrder - b.sortOrder)
  useEffect(() => {
    if (periods.length < 12) store.ensureYear(year)
  }, [periods.length, year, store])
  const years = Array.from(new Set(store.db.periods.map((p) => p.year))).sort()
  const totals = periods.reduce(
    (acc, period) => {
      const stats = periodStats(store.db, period.id)
      acc.ingresos += stats.ingresos
      acc.gastos += stats.gastos
      acc.servicios += stats.servicios
      acc.libre += stats.libre
      return acc
    },
    { ingresos: 0, gastos: 0, servicios: 0, libre: 0 },
  )
  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <p className="kicker">Vista anual</p>
          <h1 className="page-title">{year}</h1>
        </div>
        <div className="head-actions">
          <select className="year-select light" value={year} aria-label="Año" onChange={(event) => onYear(Number(event.target.value))}>
            {(years.length ? years : [year]).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="stats">
        <article className="stat">
          <span>Ingresos del año</span>
          <strong>{formatCOP(totals.ingresos)}</strong>
        </article>
        <article className="stat">
          <span>Gastos del año</span>
          <strong>{formatCOP(totals.gastos)}</strong>
        </article>
        <article className="stat">
          <span>Servicios del año</span>
          <strong>{formatCOP(totals.servicios)}</strong>
        </article>
        <article className={totals.libre < 0 ? 'stat libre neg' : 'stat libre pos'}>
          <span>Libre del año</span>
          <strong>{formatCOP(totals.libre)}</strong>
        </article>
      </section>

      <div className="year-grid">
        {periods.map((period) => {
          const stats = periodStats(store.db, period.id)
          const used = stats.ingresos > 0 ? Math.min(100, ((stats.gastos + stats.servicios) / stats.ingresos) * 100) : 0
          return (
            <button key={period.id} className="month-card" onClick={() => goPeriod(period.id)}>
              <header>{MONTHS[period.coveredMonth]}</header>
              <dl>
                <div>
                  <dt>Ingresos</dt>
                  <dd>{formatCOP(stats.ingresos)}</dd>
                </div>
                <div>
                  <dt>Gastos</dt>
                  <dd>{formatCOP(stats.gastos)}</dd>
                </div>
                <div>
                  <dt>Servicios</dt>
                  <dd>{formatCOP(stats.servicios)}</dd>
                </div>
              </dl>
              <p className={stats.libre < 0 ? 'card-libre neg' : 'card-libre'}>{formatCOP(stats.libre)}</p>
              <div className="meter" aria-hidden="true">
                <span style={{ width: `${used}%` }} />
              </div>
              <small>{period.year}</small>
            </button>
          )
        })}
        {periods.length === 0 && <p className="empty wide">Este año todavía no tiene periodos.</p>}
      </div>
    </div>
  )
}
