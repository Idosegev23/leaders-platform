import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'

const LineWaves = dynamic(() => import('@/components/LineWaves'), { ssr: false })

export default function HomePage() {
  return (
    <div dir="rtl" className="relative min-h-screen bg-[#0a0a0f] text-white font-heebo overflow-hidden">
      <div className="absolute inset-0 z-0">
        <LineWaves
          speed={0.3}
          innerLineCount={32}
          outerLineCount={36}
          warpIntensity={1}
          rotation={-45}
          edgeFadeWidth={0}
          colorCycleSpeed={1}
          brightness={0.2}
          color1="#ffffff"
          color2="#ffffff"
          color3="#ffffff"
          enableMouseInteraction
          mouseInfluence={2}
        />
      </div>

      <div className="absolute inset-0 z-[1] pointer-events-none bg-gradient-to-b from-[#0a0a0f]/40 via-transparent to-[#0a0a0f]/80" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="px-8 py-6">
          <Image src="/logo.png" alt="Leaders" width={96} height={32} className="opacity-80" />
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-[11px] tracking-[0.4em] uppercase text-white/40 mb-6">
            Leaders AI
          </div>

          <h1 className="text-6xl md:text-8xl font-black tracking-tight leading-[0.95] mb-14">
            Proposal
            <br />
            <span className="italic font-light text-white/80">Maker</span>
          </h1>

          <Link href="/login">
            <button className="group relative px-10 py-4 rounded-full bg-white text-black font-medium text-base hover:bg-white/90 transition-all duration-300 shadow-[0_0_40px_rgba(255,255,255,0.1)]">
              התחברות עם Google
              <span className="inline-block mr-2 transition-transform duration-300 group-hover:-translate-x-1">
                ←
              </span>
            </button>
          </Link>
        </main>

        <footer className="px-8 py-6 text-center">
          <p className="text-[10px] tracking-[0.3em] uppercase text-white/20">
            Internal Tool · Leaders
          </p>
        </footer>
      </div>
    </div>
  )
}
