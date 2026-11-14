export interface Holiday {
  month: number
  day: number
  name: string
}

function easter(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function shift(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Ley 51 de 1983: si no cae lunes, pasa al lunes siguiente. */
function monday(date: Date): Date {
  const weekday = date.getDay()
  if (weekday === 1) return date
  return shift(date, weekday === 0 ? 1 : 8 - weekday)
}

function at(year: number, month: number, day: number): Date {
  return new Date(year, month, day)
}

/** Festivos nacionales. Ley 51 de 1983 y Semana Santa. */
export function colombianHolidays(year: number): Holiday[] {
  const pascua = easter(year)
  const dates: { date: Date; name: string }[] = [
    { date: at(year, 0, 1), name: 'Año Nuevo' },
    { date: monday(at(year, 0, 6)), name: 'Reyes Magos' },
    { date: monday(at(year, 2, 19)), name: 'San José' },
    { date: shift(pascua, -3), name: 'Jueves Santo' },
    { date: shift(pascua, -2), name: 'Viernes Santo' },
    { date: at(year, 4, 1), name: 'Día del Trabajo' },
    { date: monday(shift(pascua, 39)), name: 'Ascensión' },
    { date: monday(shift(pascua, 60)), name: 'Corpus Christi' },
    { date: monday(shift(pascua, 68)), name: 'Sagrado Corazón' },
    { date: monday(at(year, 5, 29)), name: 'San Pedro y San Pablo' },
    { date: at(year, 6, 20), name: 'Independencia' },
    { date: at(year, 7, 7), name: 'Batalla de Boyacá' },
    { date: monday(at(year, 7, 15)), name: 'Asunción' },
    { date: monday(at(year, 9, 12)), name: 'Día de la Raza' },
    { date: monday(at(year, 10, 1)), name: 'Todos los Santos' },
    { date: monday(at(year, 10, 11)), name: 'Independencia de Cartagena' },
    { date: at(year, 11, 8), name: 'Inmaculada Concepción' },
    { date: at(year, 11, 25), name: 'Navidad' },
  ]
  return dates
    .map(({ date, name }) => ({ month: date.getMonth(), day: date.getDate(), name }))
    .sort((a, b) => a.month - b.month || a.day - b.day)
}

export interface MonthCalendar {
  days: number
  businessDays: number
  holidays: Holiday[]
}

/** Lunes a viernes, sin festivos nacionales. */
export function monthCalendar(year: number, month: number): MonthCalendar {
  const holidays = colombianHolidays(year).filter((holiday) => holiday.month === month)
  const days = new Date(year, month + 1, 0).getDate()
  const off = new Set(holidays.map((holiday) => holiday.day))
  let businessDays = 0
  for (let day = 1; day <= days; day++) {
    const weekday = new Date(year, month, day).getDay()
    if (weekday === 0 || weekday === 6 || off.has(day)) continue
    businessDays++
  }
  return { days, businessDays, holidays }
}
