import Link from 'next/link'

const YEAR_EDITION = 'MMXXVI'

export default function HomePage() {
  return (
    <div dir="rtl" className="relative min-h-screen bg-brand-pearl text-brand-primary font-heebo overflow-hidden">
      <EditorialHeader />

      <main className="relative pt-24 pb-24 px-6 md:px-10">
        <div className="mx-auto max-w-[1400px] grid gap-3 md:grid-cols-5 md:grid-rows-2 md:auto-rows-fr md:min-h-[calc(100vh-11rem)]">
          <HeroTile />
          <Tile01Brief />
          <Tile02Kickoff />
          <Tile03Quote />
          <Tile04Deck />
          <Tile05Summary />
        </div>
      </main>

      <EditorialFooter />
    </div>
  )
}

/* ------------------------------------------------------------- */
/* Header / Footer                                               */
/* ------------------------------------------------------------- */

function EditorialHeader() {
  return (
    <header className="absolute top-0 inset-x-0 z-10 border-b border-brand-primary/10 bg-brand-pearl/60 backdrop-blur-sm">
      <div className="mx-auto max-w-[1400px] flex items-center justify-between px-6 md:px-10 py-5">
        <span className="font-cormorant italic text-lg md:text-xl tracking-[0.18em] text-brand-primary">
          Leaders
        </span>
        <div className="flex items-center gap-4 text-[10px] md:text-[11px] tracking-[0.32em] uppercase text-brand-primary/55 font-rubik">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-accent animate-pulse-soft" aria-hidden />
          <span>Tel Aviv · Internal</span>
        </div>
      </div>
    </header>
  )
}

function EditorialFooter() {
  return (
    <footer className="absolute bottom-0 inset-x-0 border-t border-brand-primary/10">
      <div className="mx-auto max-w-[1400px] flex items-center justify-between px-6 md:px-10 py-4 text-[10px] tracking-[0.32em] uppercase text-brand-primary/45 font-rubik">
        <span>Private · Authorized Staff</span>
        <span>v.1 · {YEAR_EDITION}</span>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------- */
/* Hero tile                                                      */
/* ------------------------------------------------------------- */

function HeroTile() {
  return (
    <section className="md:col-span-3 md:row-span-2 bg-brand-ivory ring-1 ring-brand-primary/10 rounded-sm p-10 md:p-14 flex flex-col justify-between relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" aria-hidden>
        <div className="absolute inset-y-0 left-1/3 w-px bg-brand-primary" />
        <div className="absolute inset-y-0 left-2/3 w-px bg-brand-primary" />
      </div>

      <div className="relative">
        <div className="text-[10px] md:text-[11px] tracking-[0.4em] uppercase text-brand-primary/55 font-rubik mb-6">
          Leaders OS · מערכת ההפעלה
        </div>

        <h1 className="font-cormorant font-normal leading-[0.92] tracking-tight text-[56px] sm:text-[72px] md:text-[88px] lg:text-[104px] text-brand-primary">
          מבריף
          <br />
          <span className="italic font-light">ועד השקה.</span>
        </h1>

        <p className="mt-8 max-w-md font-assistant text-[15px] md:text-base leading-relaxed text-brand-primary/65">
          חמישה כלים. זרימה אחת. מערכת פנימית של לידרס לניהול הלקוח
          מהפגישה הראשונה ועד סיכום הקמפיין.
        </p>
      </div>

      <div className="relative mt-12">
        <Link
          href="/login"
          className="group inline-flex items-center gap-3 rounded-full bg-brand-primary text-white px-8 py-4 text-[14px] md:text-[15px] font-medium tracking-[0.06em] transition-all duration-300 hover:bg-brand-accent hover:shadow-[0_10px_40px_-12px_rgba(233,69,96,0.5)]"
        >
          <span>התחברות עם Google</span>
          <span
            aria-hidden
            className="inline-block transition-transform duration-300 group-hover:-translate-x-1"
          >
            ←
          </span>
        </Link>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- */
/* Tiles — the 5 modules                                          */
/* ------------------------------------------------------------- */

function TileShell({
  children,
  className = '',
  numeral,
  hebrewTitle,
  englishTitle,
  light = false,
}: {
  children?: React.ReactNode
  className?: string
  numeral: string
  hebrewTitle: string
  englishTitle: string
  light?: boolean
}) {
  const textColor = light ? 'text-white' : 'text-brand-primary'
  const mutedColor = light ? 'text-white/75' : 'text-brand-primary/55'

  return (
    <article
      className={`group relative overflow-hidden rounded-sm ring-1 ring-brand-primary/10 transition-[transform,box-shadow] duration-500 hover:-translate-y-[2px] hover:shadow-[0_18px_40px_-18px_rgba(21,18,13,0.18)] ${className}`}
    >
      {children}
      <span
        className={`absolute top-5 start-5 font-rubik text-[10px] tracking-[0.32em] uppercase ${mutedColor}`}
      >
        {numeral}
      </span>
      <div className={`absolute bottom-5 start-5 end-5 flex items-end justify-between ${textColor}`}>
        <span className="font-heebo text-[20px] md:text-[22px] font-medium tracking-tight">
          {hebrewTitle}
        </span>
        <span className={`font-cormorant italic text-[15px] ${mutedColor}`}>
          {englishTitle}
        </span>
      </div>
    </article>
  )
}

function Tile01Brief() {
  return (
    <TileShell
      numeral="01"
      hebrewTitle="בריף לקוח"
      englishTitle="Client Brief"
      className="bg-brand-ivory min-h-[200px] md:min-h-0"
    >
      <svg
        aria-hidden
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full opacity-60"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={i}
            x1={40}
            x2={360}
            y1={100 + i * 28}
            y2={100 + i * 28}
            stroke="rgb(26 26 46)"
            strokeWidth="0.6"
            strokeDasharray={i === 2 ? '2 4' : undefined}
            opacity={0.25 + i * 0.08}
            className="origin-center animate-drift-line"
            style={{ animationDelay: `${i * 0.4}s` }}
          />
        ))}
      </svg>
    </TileShell>
  )
}

function Tile02Kickoff() {
  return (
    <TileShell
      numeral="02"
      hebrewTitle="פגישת התנעה"
      englishTitle="Kick-off"
      className="bg-brand-ivory min-h-[200px] md:min-h-0"
    >
      <svg
        aria-hidden
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
      >
        <circle cx="200" cy="140" r="44" fill="none" stroke="rgb(26 26 46)" strokeWidth="0.6" opacity="0.25" />
        <g className="origin-[200px_140px] animate-orbit">
          <circle cx="244" cy="140" r="4" fill="rgb(26 26 46)" />
          <circle cx="156" cy="140" r="4" fill="rgb(26 26 46)" opacity="0.55" />
        </g>
      </svg>
    </TileShell>
  )
}

function Tile03Quote() {
  return (
    <TileShell
      numeral="03"
      hebrewTitle="הצעת מחיר"
      englishTitle="Price Quote"
      className="min-h-[200px] md:min-h-0 text-white"
      light
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgb(233 69 96) 0%, rgb(201 162 39) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.4) 0 1px, transparent 1px 80px)',
        }}
      />
      <span
        aria-hidden
        className="absolute top-12 end-10 font-cormorant text-[96px] md:text-[120px] leading-none font-light text-white/90 tabular-nums"
      >
        ₪
      </span>
    </TileShell>
  )
}

function Tile04Deck() {
  return (
    <TileShell
      numeral="04"
      hebrewTitle="מצגת קריאייטיבית"
      englishTitle="Creative Deck"
      className="bg-brand-ivory min-h-[200px] md:min-h-0"
    >
      <div aria-hidden className="absolute inset-0 grid place-items-center">
        <div className="relative h-[150px] w-[110px]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`absolute inset-0 border border-brand-primary/15 transition-transform duration-500 group-hover:rotate-0 group-hover:translate-x-0 ${
                i === 2 ? 'bg-brand-primary' : 'bg-white'
              }`}
              style={{
                transform: `translate(${(i - 1) * 14}px, ${(i - 1) * -8}px) rotate(${
                  (i - 1) * 4
                }deg)`,
                zIndex: i,
              }}
            />
          ))}
        </div>
      </div>
    </TileShell>
  )
}

function Tile05Summary() {
  return (
    <TileShell
      numeral="05"
      hebrewTitle="מצגת סיכום"
      englishTitle="Campaign Summary"
      className="min-h-[200px] md:min-h-0"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgb(245 243 239) 0%, rgb(253 238 241) 100%)',
        }}
      />
      <svg
        aria-hidden
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
      >
        <line x1="0" x2="400" y1="200" y2="200" stroke="rgb(26 26 46)" strokeWidth="0.6" opacity="0.3" />
        <circle
          cx="200"
          cy="170"
          r="26"
          fill="none"
          stroke="rgb(26 26 46)"
          strokeWidth="0.8"
          opacity="0.45"
          className="animate-horizon-sun"
        />
      </svg>
      <span className="absolute top-5 end-5 font-rubik text-[9px] tracking-[0.32em] uppercase text-brand-primary/50">
        בקרוב · Soon
      </span>
    </TileShell>
  )
}
