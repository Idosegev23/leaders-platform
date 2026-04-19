import Link from 'next/link'

export const metadata = {
  title: 'מצגת סיכום — בבנייה',
}

export default function SummaryPage() {
  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="inline-block mb-6 text-[10px] tracking-[0.4em] uppercase px-3 py-1 rounded-full bg-amber-100 text-amber-800">
          בבנייה
        </div>
        <h1 className="text-3xl font-bold mb-3">מצגת סיכום</h1>
        <p className="text-muted-foreground mb-8">
          הרובריקה הזאת עוד בפיתוח. בקרוב תוכל להפיק מצגת סיכום קמפיין אוטומטית
          מפגישת ההתנעה, הצעת המחיר ונתוני הביצוע.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          חזרה לדשבורד
        </Link>
      </div>
    </div>
  )
}
