export function Mark({ name }: { name: string }) {
  const key = name.trim().toLowerCase()
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {key === 'cuentas' && (
        <>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
        </>
      )}
      {key === 'pendientes' && (
        <>
          <rect x="4" y="4" width="6" height="16" rx="1.5" />
          <rect x="14" y="4" width="6" height="10" rx="1.5" />
        </>
      )}
      {key === 'bienestar' && (
        <>
          <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" />
        </>
      )}
      {key === 'libros' && (
        <>
          <path d="M5 5.5h6.5A2.5 2.5 0 0 1 14 8v11H7.2A2.2 2.2 0 0 0 5 21.2z" />
          <path d="M19 5.5h-6.5A2.5 2.5 0 0 0 10 8v11h6.8A2.2 2.2 0 0 1 19 21.2z" />
        </>
      )}
      {key === 'música' || key === 'musica' ? (
        <>
          <path d="M9 18V6l10-2v12" />
          <circle cx="7" cy="18" r="2.2" />
          <circle cx="17" cy="16" r="2.2" />
        </>
      ) : null}
      {key === 'ejercicio' && (
        <>
          <path d="M7 9v6M17 9v6M4 10.5v3M20 10.5v3M7 12h10" />
        </>
      )}
      {key === 'economía' || key === 'economia' ? (
        <>
          <ellipse cx="12" cy="7" rx="7" ry="3" />
          <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
          <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
        </>
      ) : null}
      {key === 'varios' && (
        <>
          <circle cx="8" cy="8" r="1.7" />
          <circle cx="16" cy="8" r="1.7" />
          <circle cx="8" cy="16" r="1.7" />
          <circle cx="16" cy="16" r="1.7" />
        </>
      )}
      {key === 'eventos' && (
        <>
          <path d="M8 5v2.5M16 5v2.5" />
          <rect x="5" y="7" width="14" height="12" rx="2" />
          <path d="M8 13h3M13 13h3" />
        </>
      )}
      {key === 'reportes' && (
        <>
          <path d="M5 19V11" />
          <path d="M12 19V5" />
          <path d="M19 19v-6" />
        </>
      )}
      {key === 'calendario' && (
        <>
          <path d="M8 4.5v3M16 4.5v3" />
          <rect x="4" y="6" width="16" height="14" rx="2" />
          <path d="M4 10h16" />
        </>
      )}
      {key === 'por hacer' && <circle cx="12" cy="12" r="7" />}
      {key === 'en curso' && <path d="M8 6.5v11l9-5.5z" />}
      {key === 'hecho' && <path d="M5 12.5 9.5 17 19 7.5" />}
      {key === 'todas' && (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <rect x="14" y="14" width="6" height="6" rx="1" />
        </>
      )}
      {key === 'sin categoría' || key === 'sin categoria' ? <path d="M6 12h12" /> : null}
    </svg>
  )
}
