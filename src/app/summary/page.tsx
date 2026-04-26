import Link from 'next/link'

export const metadata = {
  title: 'מצגת סיכום — בבנייה',
}

export default function SummaryPage() {
  return (
    <div dir="rtl" className="max-w-3xl mx-auto px-6 md:px-10 py-20 md:py-28 text-brand-primary">
      <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">
        Leaders <span className="mx-1 text-brand-primary/75">x</span> OS · Summary
      </p>

      <div className="inline-flex items-center gap-2 ring-1 ring-brand-primary/15 bg-brand-ivory rounded-full px-3 py-1 mb-10">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-gold animate-pulse-soft" />
        <span className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/65 font-rubik font-medium">
          בבנייה · In Progress
        </span>
      </div>

      <h1 className="text-[44px] md:text-[56px] leading-[1.05] font-medium tracking-tight mb-6">
        מצגת <span className="font-bold">סיכום קמפיין</span>.
      </h1>

      <p className="text-[15px] md:text-[16px] leading-relaxed text-brand-primary/70 max-w-xl">
        הרובריקה הזאת עוד בפיתוח. בקרוב נוכל להפיק אוטומטית מצגת סיכום
        קמפיין שמאחדת את בריף הלקוח, פגישת ההתנעה, הצעת המחיר ונתוני
        הביצוע מ־Meta / TikTok / Google בפורמט אחיד ומותאם ללקוח.
      </p>

      <div className="mt-14 grid gap-3 max-w-2xl">
        {[
          ['01', 'הגדרת מקורות דאטה', 'Meta / TikTok / Google / IMAI'],
          ['02', 'תבנית מצגת אחידה', 'Cover + KPIs + קריאייטיב + מסקנות'],
          ['03', 'מחולל AI', 'אגריגציה + נרטיב + ייצוא PDF/PPTX'],
        ].map(([num, title, desc]) => (
          <div
            key={num}
            className="flex items-start gap-5 p-5 ring-1 ring-brand-primary/10 rounded-sm bg-brand-ivory"
          >
            <span className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/55 font-rubik shrink-0 pt-1 font-medium">
              {num}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{title}</p>
              <p className="text-[12px] text-brand-primary/65 mt-1">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[13px] text-brand-primary/65 hover:text-brand-accent transition-colors font-rubik tracking-[0.04em] font-medium"
        >
          <span>←</span>
          <span>חזרה לדשבורד</span>
        </Link>
      </div>
    </div>
  )
}
