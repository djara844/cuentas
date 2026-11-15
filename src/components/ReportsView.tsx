import { useMemo } from 'react'
import { MONTHS, periodStats, type Kind } from '../types'
import { formatCOP } from '../money'
import { useStore } from '../store'
import { Fold } from './Fold'

export function ReportsView({ year }: { year: number }) {
  const store = useStore()
  const report = useMemo(() => {
    const periods = store.db.periods.filter((period) => period.year === year).sort((a, b) => a.sortOrder - b.sortOrder)
    const rows = periods.map((period) => ({ period, stats: periodStats(store.db, period.id) }))
    const totals = rows.reduce(
      (acc, row) => ({
        ingresos: acc.ingresos + row.stats.ingresos,
        gastos: acc.gastos + row.stats.gastos,
        servicios: acc.servicios + row.stats.servicios,
        libre: acc.libre + row.stats.libre,
      }),
      { ingresos: 0, gastos: 0, servicios: 0, libre: 0 },
    )
    const grouped = (kind: Kind) => {
      const map = new Map<string, { name: string; color: string; amount: number }>()
      for (const row of rows) {
        for (const entry of store.db.entries) {
          if (entry.periodId !== row.period.id || entry.kind !== kind || !entry.amount) continue
          const category = store.db.categories.find((item) => item.id === entry.categoryId)
          const key = category?.id ?? `txt:${entry.description}`
          const current = map.get(key) ?? {
            name: category?.name ?? (entry.description || 'Sin categoría'),
            color: category?.color ?? '#94a3b8',
            amount: 0,
          }
          current.amount += entry.amount
          map.set(key, current)
        }
      }
      return Array.from(map.values())
        .filter((item) => item.amount !== 0)
        .sort((a, b) => b.amount - a.amount)
    }
    const active = rows.filter((row) => row.stats.ingresos || row.stats.gastos || row.stats.servicios)
    const best = active.slice().sort((a, b) => b.stats.libre - a.stats.libre)[0]
    const tight = active.slice().sort((a, b) => a.stats.libre - b.stats.libre)[0]
    return {
      rows,
      totals,
      gastos: grouped('gasto'),
      ingresos: grouped('ingreso'),
      best,
      tight,
      average: active.length ? Math.round(totals.libre / active.length) : 0,
      committed: totals.ingresos > 0 ? Math.round(((totals.gastos + totals.servicios) / totals.ingresos) * 100) : 0,
      maxLibre: Math.max(1, ...rows.map((row) => Math.abs(row.stats.libre))),
      maxSpent: Math.max(1, ...rows.map((row) => row.stats.gastos)),
      months: active.length,
    }
  }, [store.db, year])

  if (report.months === 0) {
    return (
      <div className="wrap">
        <header className="page-head">
          <div>
            <p className="kicker">Análisis</p>
            <h1 className="page-title">Reportes {year}</h1>
          </div>
        </header>
        <p className="empty wide">Este año todavía no tiene movimientos para analizar.</p>
      </div>
    )
  }

  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <p className="kicker">Análisis {year}</p>
          <h1 className="page-title">Gastos</h1>
          <p className="formula">{report.months} meses con movimiento · comprometido {report.committed}%</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-top">
          <h2>Lo que se ha gastado</h2>
          <strong>{formatCOP(report.totals.gastos)}</strong>
        </div>
      </section>

      <Rank title="Gastos por categoría" items={report.gastos} total={report.totals.gastos} />

      <Fold title="Gastos por mes" meta={formatCOP(report.totals.gastos)}>
        <ul className="bars">
          {report.rows.map((row) => (
            <li key={row.period.id}>
              <div className="bar-label">
                <span>{MONTHS[row.period.coveredMonth]}</span>
                <strong>{formatCOP(row.stats.gastos)}</strong>
              </div>
              <div className="bar" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.max(row.stats.gastos > 0 ? 6 : 0, (row.stats.gastos / report.maxSpent) * 100)}%`,
                    background: '#fbbf24',
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Fold>

      <article className={report.totals.libre < 0 ? 'hero neg' : 'hero'}>
        <p>Libre del año</p>
        <strong>{formatCOP(report.totals.libre)}</strong>
        <span>Promedio {formatCOP(report.average)} por mes</span>
      </article>

      <section className="stats" aria-label="Totales del año">
        <article className="stat">
          <p>Ingresos</p>
          <strong>{formatCOP(report.totals.ingresos)}</strong>
        </article>
        <article className="stat">
          <p>Gastos</p>
          <strong>{formatCOP(report.totals.gastos)}</strong>
        </article>
        <article className={report.totals.libre < 0 ? 'stat libre neg' : 'stat libre pos'}>
          <p>Libre</p>
          <strong>{formatCOP(report.totals.libre)}</strong>
        </article>
      </section>

      <Fold title="Libre por mes" meta={formatCOP(report.totals.libre)}>
        <ul className="bars">
          {report.rows.map((row) => (
            <li key={row.period.id}>
              <div className="bar-label">
                <span>{MONTHS[row.period.coveredMonth]}</span>
                <strong className={row.stats.libre < 0 ? 'neg' : 'pos'}>{formatCOP(row.stats.libre)}</strong>
              </div>
              <div className="bar" aria-hidden="true">
                <span
                  className={row.stats.libre < 0 ? 'neg' : 'pos'}
                  style={{ width: `${Math.max(6, (Math.abs(row.stats.libre) / report.maxLibre) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Fold>

      <Rank title="De dónde entró" items={report.ingresos} total={report.totals.ingresos} />

      <div className="pair">
        {report.best && (
          <article className="panel mini">
            <p>Mes más holgado</p>
            <strong>{MONTHS[report.best.period.coveredMonth]}</strong>
            <span className="pos">{formatCOP(report.best.stats.libre)}</span>
          </article>
        )}
        {report.tight && (
          <article className="panel mini">
            <p>Mes más justo</p>
            <strong>{MONTHS[report.tight.period.coveredMonth]}</strong>
            <span className={report.tight.stats.libre < 0 ? 'neg' : 'pos'}>{formatCOP(report.tight.stats.libre)}</span>
          </article>
        )}
      </div>
    </div>
  )
}

function Rank({ title, items, total }: { title: string; items: { name: string; color: string; amount: number }[]; total: number }) {
  const max = Math.max(1, ...items.map((item) => item.amount))
  if (items.length === 0) return null
  return (
    <Fold title={title} meta={`${items.length}`}>
      <ul className="bars">
        {items.map((item) => (
          <li key={item.name}>
            <div className="bar-label">
              <span>
                <i className="dot" style={{ background: item.color }} />
                {item.name}
              </span>
              <strong>
                {formatCOP(item.amount)}
                {total > 0 ? ` · ${Math.round((item.amount / total) * 100)}%` : ''}
              </strong>
            </div>
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${Math.max(6, (item.amount / max) * 100)}%`, background: item.color }} />
            </div>
          </li>
        ))}
      </ul>
    </Fold>
  )
}
