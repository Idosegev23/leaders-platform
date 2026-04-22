import Image from 'next/image'
import Link from 'next/link'

export default function HomePage() {
  return (
    <div dir="rtl" className="relative min-h-screen bg-[#0a0a0f] text-white font-heebo overflow-hidden flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <Image
          src="/logo.png"
          alt="Leaders"
          width={280}
          height={94}
          priority
          className="h-auto w-[200px] md:w-[260px] opacity-95"
        />

        <p className="mt-10 text-[11px] md:text-[12px] tracking-[0.5em] uppercase text-white/40 font-rubik">
          Leaders <span className="mx-1 text-white/60">x</span> OS
        </p>

        <Link
          href="/login"
          className="group mt-20 inline-flex items-center gap-3 rounded-full bg-white text-black px-10 py-4 text-[14px] md:text-[15px] font-medium tracking-[0.04em] transition-all duration-300 hover:bg-brand-accent hover:text-white"
        >
          <span>התחברות עם Google</span>
          <span aria-hidden className="inline-block transition-transform duration-300 group-hover:-translate-x-1">←</span>
        </Link>
      </main>

      <footer className="pb-8 text-center text-[10px] tracking-[0.4em] uppercase text-white/20 font-rubik">
        Private · Authorized Staff
      </footer>
    </div>
  )
}
