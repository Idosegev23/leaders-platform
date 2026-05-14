/**
 * Research angles for brand/market deep research.
 * Each angle becomes a section in the final report and (in 'maximum' / 'ultra' depth)
 * a separate Deep Research interaction.
 *
 * Order matters — it determines section order in the synthesized report.
 */

export type AngleId =
  | "market_size"
  | "audience"
  | "trends"
  | "best_sellers"
  | "adjacent_categories"
  | "competition"
  | "pricing"
  | "cost_analysis"
  | "distribution"
  | "marketing"
  | "basket_growth"
  | "technology"
  | "customer_voice"
  | "regulation"
  | "israel_layer"
  | "frameworks"
  | "brand_deep_dive"
  | "brand_ideas"
  | "weak_signals"
  | "scenarios"
  | "contrarian_view"
  | "blind_spots"
  | "swot"
  | "opportunities"
  | "recommendations"
  | "branding_recommendations"
  | "labeling_recommendations";

export type Angle = {
  id: AngleId;
  label: string;
  english: string;
  description: string;
  briefingHe: string;
  /** Whether this angle benefits from a brand URL being supplied. */
  needsBrandUrl?: boolean;
  /** True if this is a "depth" angle — heavier, ultra-tier focus. */
  ultra?: boolean;
};

export const ANGLES: Angle[] = [
  {
    id: "market_size",
    label: "גודל שוק ומגמות",
    english: "Market sizing and growth trends",
    description: "TAM/SAM/SOM, קצב צמיחה, סגמנטציה, תחזיות",
    briefingHe:
      "מפה את גודל השוק (TAM/SAM/SOM בש״ח/דולר), קצבי צמיחה היסטוריים (3-5 שנים אחורה) ועתידיים (CAGR עד 2030), סגמנטים מרכזיים עם נתחי שוק מספריים, פילוח גאוגרפי, פילוח לפי ערוצים. כל מספר חייב מקור ושנה.",
  },
  {
    id: "audience",
    label: "פרסונות וקהלי יעד",
    english: "Customer personas and target audiences",
    description: "פרסונות, JTBD, פסיכוגרפיה, מסע לקוח",
    briefingHe:
      "זהה 3-5 פרסונות עיקריות. לכל אחת: דמוגרפיה (גיל, הכנסה, מיקום, סטטוס), פסיכוגרפיה (ערכים, אורח חיים, מותגים שהם אוהבים), Jobs-to-be-Done, נקודות כאב ספציפיות, טריגרים לרכישה, מסע לקוח טיפוסי שלב-שלב, נכונות לשלם (WTP) ותדירות רכישה.",
  },
  {
    id: "trends",
    label: "מגמות תרבותיות וצרכניות",
    english: "Cultural and consumer trends",
    description: "כוחות תרבותיים, שינויים בטעם, תרבות פופ",
    briefingHe:
      "זהה מגמות מאקרו תרבותיות וצרכניות שמשפיעות על הקטגוריה: שינויים בערכים, מגמות בריאות/קיימות/אינדיבידואליות, השפעות תרבות פופולרית, תופעות צרכניות מובילות (TikTok/Instagram), נתוני חיפוש (Google Trends), ושינויים דמוגרפיים. כמת לאן זה הולך.",
  },
  {
    id: "best_sellers",
    label: "מוצרים נמכרים (Best Sellers)",
    english: "Best-selling products in the category",
    description: "המוצרים הכי נמכרים בקטגוריה — מותג, SKU, מחיר, מה הופך אותם למנצחים",
    briefingHe:
      "זהה את 10-20 המוצרים הכי נמכרים בקטגוריה (גלובלי + ישראל בנפרד אם רלוונטי). לכל מוצר: שם המותג, שם המוצר/SKU, מחיר קמעונאי, גודל אריזה, היקף מכירות שנתי משוער (יחידות + ש״ח), ערוצים מובילים (Amazon/שופרסל/D2C), דירוגי לקוחות, וניתוח של 'למה זה מנצח' — תכונה, מחיר, מיתוג, אריזה, או הפצה. הצג כטבלה ממוינת לפי מכירות.",
  },
  {
    id: "adjacent_categories",
    label: "קטגוריות סמוכות",
    english: "Adjacent categories — bleed in/out",
    description: "מה זולג פנימה/החוצה מקטגוריות שכנות",
    briefingHe:
      "זהה 4-7 קטגוריות סמוכות שמשפיעות על הקטגוריה הנחקרת: לאן צרכנים בורחים (substitution risk), מה זורם פנימה (boundary blurring), מי השחקנים מהקטגוריה הסמוכה שיכולים לפלוש, ואילו פיצ'רים/מודלים מקטגוריות אחרות ראויים לאימוץ. כמת את גודל הזליגה בכל כיוון.",
    ultra: true,
  },
  {
    id: "competition",
    label: "נוף תחרותי ושחקנים מרכזיים",
    english: "Competitive landscape and key players",
    description: "מתחרים, מטריצת מיצוב, נתחי שוק, יתרונות יחסיים",
    briefingHe:
      "זהה 8-15 שחקנים מובילים. לכל אחד: שם משפטי, מותג מסחרי, אתר, נתח שוק משוער (%), הכנסה שנתית, מספר עובדים, USP בחד-משפטי, מיצוב (פרימיום/אמצע/אקונומי), 3-5 חוזקות ו-3-5 חולשות מובחנות, ערוצי הפצה מרכזיים, אסטרטגיית גידול, מימון/בעלות. בנה מטריצת מיצוב 2-צירית רלוונטית (למשל מחיר×חדשנות).",
  },
  {
    id: "pricing",
    label: "תמחור ומיצוב",
    english: "Pricing and value positioning",
    description: "טווחי מחירים, מבני תמחור, יחס ערך-מחיר",
    briefingHe:
      "מפה את כל מבני התמחור: רצועות מחירים מדויקות (מ-X עד Y ש״ח/$), מחיר ממוצע לקטגוריה, רצועת פרימיום/אמצע/דיסקאונט עם דוגמאות, מחירים ספציפיים של 5+ מוצרים מובילים, מבני מנוי/חבילות/קומבו, מבצעים נפוצים (גודל הנחה, תדירות), מגמות מחירים ב-24 חודשים האחרונים, ויחס ערך-מחיר נתפס (price-to-perceived-value).",
  },
  {
    id: "cost_analysis",
    label: "ניתוח עלויות ומבנה רווחיות",
    english: "Cost structure and unit economics",
    description: "COGS, מרג'ינים, ספקים, מבנה רווח",
    briefingHe:
      "פרק את מבנה העלויות הטיפוסי בקטגוריה: COGS אחוזי (חומרי גלם, ייצור, אריזה), עלויות שיווק (CAC), עלויות ערוץ (עמלות מרקטפלייס, מארג' רשתות), לוגיסטיקה, R&D. ספק טווחי מרג'ין גרוס ונטו טיפוסיים. זהה ספקים מרכזיים ועלויות חומרי גלם דומיננטיות. הצג P&L מודל לדוגמה ליחידה/לחודש. סמן רגישויות עלות (סחורות, מטבע, רגולציה).",
  },
  {
    id: "distribution",
    label: "ערוצי הפצה",
    english: "Distribution channels",
    description: "D2C, רשתות, מרקטפלייסים, שותפים",
    briefingHe:
      "מפה את כל ערוצי ההפצה עם נתח אחוזי משוער לכל אחד: D2C (אתר עצמאי, אפליקציה), רשתות פיזיות (אילו), מרקטפלייסים (Amazon/eBay/iherb/אתרי תיירות), חנויות מתמחות, B2B/horeca, שותפי שיווק. לכל ערוץ: עמלה/חיתוך טיפוסי, דרישות הצטרפות, יתרונות וחסרונות, וקצב צמיחה. זהה את הערוץ עם הצמיחה הגבוהה ביותר ולמה.",
  },
  {
    id: "marketing",
    label: "אסטרטגיות שיווק",
    english: "Marketing strategies and channels",
    description: "ערוצים, מסרים, קריאייטיב, השפעה",
    briefingHe:
      "נתח כיצד מתחרים מובילים משווקים: ערוצים מובילים (Meta/Google/TikTok/Influencers/PR/SEO/email), פיזור תקציב משוער בין הערוצים, מסרים מרכזיים שחוזרים, סוגי קריאייטיב (UGC/דמויות/דמו מוצר/לפני-אחרי), קמפיינים ויראליים בולטים מ-12 חודשים אחרונים עם מספרי impressions/engagement, KPIs ידועים (CPM/CPA/ROAS), ושותפי משפיענים מובילים בקטגוריה.",
  },
  {
    id: "basket_growth",
    label: "אפשרויות הגדלת סל",
    english: "Basket growth and AOV opportunities",
    description: "קרוס-סייל, אפ-סייל, באנדלים, מנויים, וויזואל מרצ'נדייז",
    briefingHe:
      "תן 8-12 מהלכים מוכחים להגדלת ערך סל ממוצע (AOV) בקטגוריה: קרוס-סייל קלאסי (אילו זוגות מוצרים), אפ-סייל (גרסאות פרימיום/גודל גדול), באנדלים נפוצים (מה ובאיזה מחיר/הנחה), מנויים (auto-replenishment), חבילות מתנה, frequency-based rewards, ספי משלוח חינם. לכל מהלך: דוגמה ספציפית של מתחרה שמיישם, אפקט ידוע על AOV/Conversion, ועלות-יישום משוערת.",
  },
  {
    id: "technology",
    label: "טכנולוגיה וחדשנות",
    english: "Technology and innovation",
    description: "טכנולוגיות מתפתחות, חדשנות, פטנטים, סטארט-אפים",
    briefingHe:
      "סקור טכנולוגיות מתפתחות בקטגוריה: סטארט-אפים בולטים (3-7 עם תיאור, מימון, ייחוד), פטנטים אקטיביים מהשנה האחרונה, AI/אוטומציה ביישומים ספציפיים (פרסונליזציה, supply chain, שירות לקוחות), מעבר דיגיטלי (כלי AR/VR ב-retail), חידושים תפעוליים, וחומרי גלם או תהליכי ייצור חדשים.",
  },
  {
    id: "customer_voice",
    label: "קול הלקוח (כריית ביקורות)",
    english: "Customer voice — review and sentiment mining",
    description: "מה לקוחות אמיתיים אומרים — ביקורות, רדיט, סנטימנט, תלונות",
    briefingHe:
      "כרה קול לקוח אותנטי בעברית ובאנגלית: 1) ביקורות במרקטפלייסים (Amazon, iHerb, שופרסל אונליין) — ציון ממוצע, 5-10 ציטוטים בולטים בעד ונגד, נושאים חוזרים. 2) דיוני Reddit/Quora/Trustpilot/קבוצות פייסבוק רלוונטיות. 3) ניתוח סנטימנט: מה אוהבים, מה שונאים, מה מבלבל. 4) פערים בין מה שהמותגים מבטיחים למה שהלקוחות חווים. 5) מילון המונחים האותנטי שצרכנים משתמשים בו (כלי חזק לעותק שיווקי). כל ציטוט עם מקור ותאריך.",
    ultra: true,
  },
  {
    id: "regulation",
    label: "רגולציה ותקינה",
    english: "Regulation and compliance",
    description: "חוקים, רישוי, תקינה, מגבלות פרסום",
    briefingHe:
      "מפה רגולציה רלוונטית בישראל ובעולם המערבי: חוקים ספציפיים בשמותיהם, רישוי נדרש (משרדים, עלויות, זמני המתנה), תקינה (מק״ת/EU/FDA), מגבלות פרסום (מה אסור להגיד, סימוני אזהרה חובה), דרישות תיוג חוקיות, השלכות עתידיות (חקיקה בתהליך). ציין השלכות מעשיות על מי שרוצה להיכנס לקטגוריה.",
  },
  {
    id: "israel_layer",
    label: "שכבה ישראלית",
    english: "Israel-specific layer",
    description: "צרכן ישראלי, קמעונאות מקומית, כשרות, שבת, מילואים, SEO בעברית, טלגרם",
    briefingHe:
      "ניתוח עמוק וייחודי לשוק הישראלי: 1) פסיכוגרפיה ישראלית ייחודית בקטגוריה. 2) קמעונאות (שופרסל/רמי לוי/יינות ביתן/אם.פי. — נתחי שוק, יחסי כוח, תנאי מסחר). 3) כשרות, שבת, חגים — השפעות מבצעיות ופרסומיות. 4) מילואים/מצב ביטחוני — דפוסי צריכה בזמני חירום. 5) SEO בעברית (Google.co.il, חיפושים בולטים, נישות שאינן מתורגמות). 6) טלגרם/וואטסאפ קבוצות כערוץ הפצה. 7) ייבואנים, מס קנייה, מע״מ, נטל יבוא מול ייצור מקומי. 8) שחקנים מקומיים שלא נמצאים ב-Statista. ספק שמות, מספרים ומקורות בעברית כשאפשר.",
    ultra: true,
  },
  {
    id: "frameworks",
    label: "מסגרות ניתוח (Porter / VRIO / Ansoff / JTBD)",
    english: "Strategic frameworks (Porter / VRIO / Ansoff / JTBD)",
    description: "יישום פורמלי של מסגרות ניתוח אסטרטגיות",
    briefingHe:
      "יישום פורמלי, לא דקורטיבי, של 4 מסגרות: 1) Porter's 5 Forces — לכל כוח: עוצמה (1-5), נימוק קונקרטי, ראיות מהמחקר. 2) VRIO על נכסי המותג/הקטגוריה — Valuable/Rare/Inimitable/Organized. 3) Ansoff Matrix — 4 רביעים עם הזדמנויות ספציפיות (חדירה/פיתוח-מוצר/פיתוח-שוק/דיברסיפיקציה). 4) JTBD מורחב — Functional / Emotional / Social Jobs לכל פרסונה, עם force-fields (משיכה לחדש מול דחיפה לישן). פלט במבנה ברור עם דוגמאות.",
    ultra: true,
  },
  {
    id: "brand_deep_dive",
    label: "ניתוח מותג מעמיק",
    english: "Brand deep-dive analysis",
    description: "ניתוח של המותג הספציפי שצוין — היסטוריה, מיצוב, ביצועים, נכסים",
    briefingHe:
      "ניתוח 360° של המותג הספציפי שצוין (ראה brand_url בברייף): היסטוריה (שנת הקמה, מייסדים, אבני דרך), בעלות נוכחית, מספר עובדים/מסעדות/חנויות, היקף מכירות וצמיחה, פיזור מוצרים נוכחי (קטלוג עיקרי), מיצוב מוצהר ומסר מרכזי, נכסי מותג חזותיים (לוגו, פלטה, פונטים, קולות), tone of voice, נוכחות ברשתות (פלטפורמות, עוקבים, engagement rate), ביקורות והתייחסויות צרכניות מובילות, שיתופי פעולה, פערים ופציעות מותג ידועים. כל מספר עם מקור.",
    needsBrandUrl: true,
  },
  {
    id: "brand_ideas",
    label: "רעיונות חדשניים למותג",
    english: "Innovative ideas for the brand",
    description: "10-15 רעיונות קונקרטיים שהמותג יכול לבצע — מוצר, חוויה, סיפור, שיתופי פעולה",
    briefingHe:
      "יצור 12-18 רעיונות קונקרטיים ושאפתניים עבור המותג הספציפי, מבוססים על המחקר. סוגים: 1) הרחבות מוצר (SKUs חדשים, גרסאות, קטגוריות סמוכות), 2) חוויות לקוח חדשות (שירות, אריזה, אירועים), 3) שיתופי פעולה (Brand × Brand, Brand × אמן/מסעדה), 4) מהלכי תוכן/קמפיין ויראליים, 5) ערוצי הפצה חדשים, 6) גרסאות limited-edition, 7) שירותים סביב המוצר. לכל רעיון: כותרת חדה, תיאור 2-3 שורות, רציונל המבוסס על נתון מהמחקר, ומדד הצלחה ראשי. דרג לפי אטרקטיביות × יכולת ביצוע.",
    needsBrandUrl: true,
  },
  {
    id: "weak_signals",
    label: "אותות חלשים (פטנטים, גיוסים, hiring)",
    english: "Weak signals — patents, funding, hiring patterns",
    description: "הסימנים המקדימים — איפה השוק עתיד להגיע ל-12-24 חודשים מהיום",
    briefingHe:
      "זהה אותות מקדימים שמרבית האנליסטים מפספסים: 1) פטנטים שאושרו ב-USPTO/EPO ב-12 חודשים אחרונים בקטגוריה — מי, מה, על מה. 2) סבבי גיוס (Crunchbase/PitchBook) — גודל סבב, משקיעים, ייעוד הון. 3) הזזות hiring בלינקדאין — אילו תפקידים מתחילים לגייס מתחרים מובילים (מסמן לאן הם הולכים). 4) רכישות ומיזוגים בקטגוריה. 5) עזיבות בכירים. 6) רישומי domains, חברות חדשות, ופניות לרגולטור. 7) פודקאסטים ויוטיוב באוזניים מנהלי קטגוריה. לכל אות: מקור, תאריך, ופירוש אסטרטגי במשפט.",
    ultra: true,
  },
  {
    id: "scenarios",
    label: "תרחישי עתיד (Base / Bull / Bear)",
    english: "Future scenarios — base / bull / bear",
    description: "3 תרחישים ל-3-5 שנים עם הנחות, נקודות שבירה וקטליזטורים",
    briefingHe:
      "בנה 3 תרחישים מובחנים לקטגוריה ולמותג ל-3-5 שנים: 1) Base case (תוצאה צפויה) — הנחות מפורטות, גודל שוק צפוי, מצב המתחרים, מצב המותג. 2) Bull case (האפשרי הטוב) — מה צריך לקרות (3-5 קטליזטורים), הסתברות, תרחיש סופי. 3) Bear case (האפשרי הרע) — איומים מציאותיים, נקודות שבירה, sirens להתריע. לכל תרחיש: 4-6 הנחות נומריות (CAGR/Penetration/Margin), 3 KPIs לעקוב, ו-2 החלטות שמשתנות ביניהם. אל תכתוב 'יתכן' — תן הסתברויות.",
    ultra: true,
  },
  {
    id: "contrarian_view",
    label: "פרקליט-השטן (קונטרה)",
    english: "Contrarian view — the case against",
    description: "מה הקונצנזוס בקטגוריה טועה לגביו, התזה ההפוכה, מומחים מהצד השני",
    briefingHe:
      "הצג בכוונה את התזה ההפוכה: 1) מה הקונצנזוס המוצק בקטגוריה? נסח אותו בחדות. 2) מה הראיות נגדו? נתונים שסותרים, מקרים שמתפקקים, מותגים שנפלו אחרי שעקבו אחר הקונצנזוס. 3) מי המומחה/חוקר/מנכ״ל המוערך שמחזיק בעמדה לא-פופולרית? מה הוא טוען ועל מה הוא מתבסס? 4) אם המתחרה הגדול בקטגוריה היה טועה במהלך אסטרטגי בעוד שנה, מה זה היה? 5) הצע 3 'אמיתות נסתרות' שיגרמו לאדם שעובד בתחום להגיד 'מעניין, לא חשבתי על זה ככה'. אל תהיה גנרי — דרוש סיכון אינטלקטואלי.",
    ultra: true,
  },
  {
    id: "blind_spots",
    label: "נקודות עיוורון",
    english: "Blind spots — what we'd otherwise miss",
    description: "מה שכמעט בטוח שמפספסים — ניואנסים, חריגים, נישות, אזהרות",
    briefingHe:
      "צייד את הניואנסים שאנליסט ממוצע יפספס: 1) שחקן לא-ברור שמשפיע יותר ממה שנראה (ספק חומר גלם, distributor, רגולטור, סלב, פלטפורמה). 2) מועד/עונה/אירוע שמשנה הכל בקטגוריה (חגים, חופשות, שבועות מילואים, השקות). 3) פערי דאטא חמורים — מקומות שאף אחד לא באמת יודע ולכן כולם מנחשים. 4) הנחה רחבה שכולם מקבלים שעלולה להישבר. 5) חיבור בין-תעשייתי שמייצר הזדמנות נסתרת. 6) דמוגרפיה/קהל שמתעצב כקהל יעד אבל עוד לא זיהו אותו. 7) אזהרות אופרטיביות — דברים שהורגים פרויקטים בשנה הראשונה. כל פריט עם דוגמה ספציפית מהמחקר.",
    ultra: true,
  },
  {
    id: "swot",
    label: "SWOT לקטגוריה ולמותג",
    english: "SWOT — category and brand",
    description: "חוזקות, חולשות, הזדמנויות, איומים",
    briefingHe:
      "בנה SWOT דו-שכבתי: שכבה 1 ברמת הקטגוריה בגאוגרפיה הרלוונטית, שכבה 2 ברמת המותג הספציפי (אם נתון). לכל פריט 1-2 שורות עם תמיכה בנתון מהמחקר. אל תכתוב פריטים גנריים.",
  },
  {
    id: "opportunities",
    label: "הזדמנויות ו-Whitespace",
    english: "Opportunities and whitespace",
    description: "צרכים בלתי-פתורים, נישות מתפתחות, פערים",
    briefingHe:
      "זהה 6-10 הזדמנויות whitespace קונקרטיות: צרכים שאף מתחרה לא מספק, סגמנטים שאינם מטופלים (גיל/כנסה/אורח חיים), גאוגרפיות פתוחות, חיבורים בין-קטגוריאליים, שעות/מועדים שאינם מנוצלים. לכל הזדמנות: גודל שוק משוער, רמת תחרות, קושי כניסה, ופוטנציאל הכנסה ב-3 שנים. דרג ב-impact×feasibility matrix.",
  },
  {
    id: "recommendations",
    label: "המלצות אסטרטגיות",
    english: "Strategic recommendations",
    description: "מהלכים אופרטיביים, סדרי עדיפויות, רוד-מאפ",
    briefingHe:
      "תן 5-8 המלצות אסטרטגיות אופרטיביות (לא כלליות). לכל אחת: כותרת חדה, רציונל המבוסס על נתונים מהמחקר עם הפניה לסעיף, מהלך קונקרטי (3-5 צעדים), בעלים מוצע (CMO/COO/CEO), KPI ראשי, סיכון, ציפייה להחזר, ורוד-מאפ זמן (0-3/3-12/12+ חודשים).",
  },
  {
    id: "branding_recommendations",
    label: "המלצות מיתוג",
    english: "Branding recommendations",
    description: "זהות מותג, מיצוב, סיפור, ויזואל, tone of voice",
    briefingHe:
      "תן 6-10 המלצות מיתוג קונקרטיות: חידוד מיצוב (טאגליין מוצע), חיזוק זהות חזותית (כיוונים לפלטה, טיפוגרפיה, איקונוגרפיה), סיפור מותג (narrative arc), tone of voice (3-5 כללים), ארכיטקטורת מותג (Master/Sub-brands/Endorsements), חוויית מותג בנקודות מגע מרכזיות (אתר, אריזה, חנות, רשתות). כל המלצה עם רציונל מבוסס מחקר ודוגמת ביצוע ויזואלי/מילולי.",
  },
  {
    id: "labeling_recommendations",
    label: "המלצות תיוג ואריזה",
    english: "Labeling, packaging and tagging recommendations",
    description: "אריזה, תוויות, סימוני אזהרה, מטא-טאגים, האשטאגים",
    briefingHe:
      "תן 6-10 המלצות תיוג ברמות: 1) תוויות פיזיות על אריזת המוצר (היררכיה ויזואלית, claims חוקיים, סימוני בריאות/קיימות, שפת הקטגוריה), 2) חובות רגולטוריות שצריך לציית, 3) משקלי תוויות מובילים בקטגוריה לחיקוי/בידול, 4) SEO meta-tags לאתר (title, description, schema.org/Product, alt-text), 5) האשטאגים מובילים ברשתות לפי פלטפורמה (Instagram/TikTok/X), 6) תיוגי קטלוג ב-Amazon/שופרסל. כל המלצה עם דוגמה מילולית ספציפית.",
  },
];

export const ANGLE_GROUPS: { id: string; label: string; angles: AngleId[] }[] = [
  {
    id: "market_demand",
    label: "שוק וביקוש",
    angles: ["market_size", "audience", "trends", "best_sellers", "adjacent_categories"],
  },
  {
    id: "competition_economics",
    label: "תחרות וכלכלת יחידה",
    angles: ["competition", "pricing", "cost_analysis", "distribution"],
  },
  {
    id: "marketing_growth",
    label: "שיווק וצמיחה",
    angles: ["marketing", "basket_growth", "technology", "customer_voice"],
  },
  {
    id: "brand_focus",
    label: "המותג",
    angles: ["brand_deep_dive", "brand_ideas", "branding_recommendations", "labeling_recommendations"],
  },
  {
    id: "context_strategy",
    label: "הקשר ואסטרטגיה",
    angles: ["regulation", "israel_layer", "frameworks", "swot", "opportunities"],
  },
  {
    id: "foresight",
    label: "מבט קדימה",
    angles: ["weak_signals", "scenarios", "contrarian_view", "blind_spots", "recommendations"],
  },
];

export function getAngles(ids: AngleId[]): Angle[] {
  return ANGLES.filter((a) => ids.includes(a.id));
}

export function allAngleIds(): AngleId[] {
  return ANGLES.map((a) => a.id);
}

/** Default angles for non-ultra tiers — drops the heaviest "ultra" angles to keep wall time sane. */
export function defaultAngleIds(tier: "express" | "standard" | "maximum" | "ultra"): AngleId[] {
  if (tier === "ultra") return ANGLES.map((a) => a.id);
  return ANGLES.filter((a) => !a.ultra).map((a) => a.id);
}

/**
 * Curated angle set for "meeting-prep" mode (used by the BD team).
 * Focuses on what someone needs to walk into a kickoff meeting with a brand:
 * who they are, what they sell, what's working/not, what competitors are doing,
 * and where Leaders can credibly add value. Skips heavy analytical angles
 * (cost/distribution/frameworks) that don't help BD lead a conversation.
 */
export function meetingPrepAngleIds(): AngleId[] {
  return [
    "brand_deep_dive",
    "audience",
    "competition",
    "best_sellers",
    "pricing",
    "marketing",
    "customer_voice",
    "weak_signals",
    "israel_layer",
    "swot",
    "opportunities",
    "brand_ideas",
  ];
}
