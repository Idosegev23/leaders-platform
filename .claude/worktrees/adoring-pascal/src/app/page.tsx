import Link from 'next/link'
import Image from 'next/image'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#1a1a1a]">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 relative">
        {/* Geometric Background */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Grid Pattern */}
          <div 
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `
                linear-gradient(to right, #ffffff 1px, transparent 1px),
                linear-gradient(to bottom, #ffffff 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px'
            }}
          />
          {/* Accent Lines */}
          <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="absolute bottom-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Content */}
        <div className="relative z-10 text-center max-w-4xl mx-auto">
          {/* Leaders Logo */}
          <div className="mb-8">
            <Image 
              src="/logo.png" 
              alt="Leaders" 
              width={180} 
              height={60}
              className="mx-auto"
            />
          </div>

          {/* DocMaker Title */}
          <div className="mb-12">
            <h1 className="text-5xl md:text-7xl font-heebo font-black text-white tracking-tight">
              Doc<span className="text-[#e94560]">Maker</span>
            </h1>
            <div className="h-1 w-32 bg-white mx-auto mt-6" />
          </div>

          {/* Tagline */}
          <p className="text-xl md:text-2xl text-white/70 mb-12 font-assistant leading-relaxed max-w-2xl mx-auto">
            יצירת הצעות מחיר ומצגות קריאטיב
            <br />
            <span className="text-white font-medium">באיכות מקצועית, בדקות ספורות</span>
          </p>

          {/* Features Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            {[
              'שיחה חכמה בעברית',
              'יצירת תמונות AI',
              'עיצוב מקצועי',
              'PDF באיכות גבוהה',
            ].map((feature, i) => (
              <div
                key={i}
                className="p-4 border border-white/10 bg-white/5 text-white/80 text-sm"
              >
                {feature}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <button className="min-w-[200px] px-8 py-4 bg-white text-black font-bold text-lg hover:bg-gray-100 transition-colors">
                התחל עכשיו
              </button>
            </Link>
            <Link href="/login">
              <button className="min-w-[200px] px-8 py-4 border-2 border-white text-white font-bold text-lg hover:bg-white hover:text-black transition-colors">
                התחבר
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* How it Works Section */}
      <section className="py-24 px-4 bg-[#0f0f0f]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-heebo font-bold text-center text-white mb-20">
            איך זה עובד?
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'בחר סוג מסמך',
                description: 'הצעת מחיר או מצגת קריאטיב - המערכת תתאים את השאלות',
              },
              {
                step: '02',
                title: 'ענה על שאלות',
                description: 'שיחה טבעית בעברית עם AI שמבין את הצרכים שלך',
              },
              {
                step: '03',
                title: 'קבל PDF מקצועי',
                description: 'מסמך מעוצב באיכות גבוהה, מוכן לשליחה ללקוח',
              },
            ].map((item, i) => (
              <div
                key={i}
                className="p-8 border border-white/10 bg-[#1a1a1a] group hover:border-white/30 transition-all duration-300"
              >
                <div className="text-5xl font-bold text-white/10 mb-6 font-heebo">
                  {item.step}
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">{item.title}</h3>
                <p className="text-white/60">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/10 bg-[#0f0f0f]">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-4">
          <Image 
            src="/logo.png" 
            alt="Leaders" 
            width={100} 
            height={33}
            className="opacity-50"
          />
          <p className="text-sm text-white/40">Leaders - DocMaker</p>
        </div>
      </footer>
    </div>
  )
}
