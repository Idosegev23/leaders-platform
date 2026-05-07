/**
 * The 12 standard research angles for brand/market deep research.
 * Each angle becomes a section in the final report and (in 'maximum' depth)
 * a separate Deep Research Max interaction.
 */

export type AngleId =
  | "market_size"
  | "audience"
  | "competition"
  | "pricing"
  | "distribution"
  | "marketing"
  | "regulation"
  | "trends"
  | "technology"
  | "swot"
  | "opportunities"
  | "recommendations";

export type Angle = {
  id: AngleId;
  label: string;
  english: string;
  description: string;
  briefingHe: string;
};

export const ANGLES: Angle[] = [
  {
    id: "market_size",
    label: "גודל שוק ומגמות",
    english: "Market sizing and growth trends",
    description: "TAM/SAM/SOM, קצב צמיחה, סגמנטציה, תחזיות",
    briefingHe:
      "מפה את גודל השוק (TAM/SAM/SOM), קצבי צמיחה היסטוריים ועתידיים (CAGR), סגמנטים מרכזיים, ותחזיות עד 2030. כל מספר חייב מקור.",
  },
  {
    id: "audience",
    label: "פרסונות וקהלי יעד",
    english: "Customer personas and target audiences",
    description: "פרסונות, JTBD, פסיכוגרפיה, מסע לקוח",
    briefingHe:
      "זהה 3-5 פרסונות עיקריות. לכל אחת: דמוגרפיה, פסיכוגרפיה, Jobs-to-be-Done, נקודות כאב, טריגרים לרכישה, מסע לקוח טיפוסי.",
  },
  {
    id: "competition",
    label: "נוף תחרותי",
    english: "Competitive landscape",
    description: "מתחרים, מטריצת מיצוב, נתחי שוק, יתרונות יחסיים",
    briefingHe:
      "זהה 5-15 שחקנים מובילים. לכל אחד: מיצוב, USP, נתח שוק משוער, חוזקות וחולשות, ערוצים. בנה מטריצת מיצוב 2-צירית רלוונטית.",
  },
  {
    id: "pricing",
    label: "תמחור ומיצוב",
    english: "Pricing and value positioning",
    description: "טווחי מחירים, מבני תמחור, יחס ערך-מחיר",
    briefingHe:
      "מפה את כל מבני התמחור בשוק (פרימיום/אמצע/דיסקאונט), מחירים מדויקים, מבני מנוי/חבילות, מבצעים נפוצים. נתח את יחס הערך-מחיר.",
  },
  {
    id: "distribution",
    label: "ערוצי הפצה",
    english: "Distribution channels",
    description: "D2C, רשתות, מרקטפלייסים, שותפים",
    briefingHe:
      "מפה את כל ערוצי ההפצה: D2C, רשתות פיזיות, מרקטפלייסים, סוחרים, שותפי שיווק. נתח את החלוקה הצפויה ואיפה הצמיחה.",
  },
  {
    id: "marketing",
    label: "אסטרטגיות שיווק",
    english: "Marketing strategies and channels",
    description: "ערוצים, מסרים, קריאייטיב, השפעה",
    briefingHe:
      "נתח כיצד מתחרים מובילים משווקים: ערוצים מובילים (Meta/Google/TikTok/Influencers/PR/SEO), פלטפורמות, מסרים מרכזיים, סוגי קריאייטיב, KPIs ידועים.",
  },
  {
    id: "regulation",
    label: "רגולציה ותקינה",
    english: "Regulation and compliance",
    description: "חוקים, רישוי, תקינה, מגבלות פרסום",
    briefingHe:
      "מפה רגולציה רלוונטית בישראל ובעולם המערבי: רישוי, תקינה, מגבלות פרסום, סטנדרטים, צרכי תיוג, השלכות עתידיות.",
  },
  {
    id: "trends",
    label: "מגמות תרבותיות וצרכניות",
    english: "Cultural and consumer trends",
    description: "כוחות תרבותיים, שינויים בטעם, תרבות פופ",
    briefingHe:
      "זהה מגמות מאקרו תרבותיות וצרכניות שמשפיעות על הקטגוריה: שינויים בערכים, מגמות בריאות, סביבה, דאטא דמוגרפי, השפעות תרבות פופולרית.",
  },
  {
    id: "technology",
    label: "טכנולוגיה וחדשנות",
    english: "Technology and innovation",
    description: "טכנולוגיות מתפתחות, חדשנות, פטנטים, סטארט-אפים",
    briefingHe:
      "סקור טכנולוגיות מתפתחות בקטגוריה: סטארט-אפים בולטים, פטנטים, AI/אוטומציה, מעבר דיגיטלי, חידושים תפעוליים.",
  },
  {
    id: "swot",
    label: "SWOT לקטגוריה",
    english: "Category-level SWOT",
    description: "חוזקות, חולשות, הזדמנויות, איומים",
    briefingHe:
      "בנה SWOT ברמת הקטגוריה בגאוגרפיה הרלוונטית. כל פריט חייב להיתמך בנתונים שמופיעים במחקר.",
  },
  {
    id: "opportunities",
    label: "הזדמנויות ו-Whitespace",
    english: "Opportunities and whitespace",
    description: "צרכים בלתי-פתורים, נישות מתפתחות, פערים",
    briefingHe:
      "זהה הזדמנויות whitespace: צרכים שמתחרים לא מספקים, סגמנטים שאינם מטופלים, גאוגרפיות פתוחות, חיבורים בין-קטגוריאליים. דרג לפי פוטנציאל.",
  },
  {
    id: "recommendations",
    label: "המלצות אסטרטגיות",
    english: "Strategic recommendations",
    description: "מהלכים מוצעים, סדרי עדיפויות, רוד-מאפ",
    briefingHe:
      "תן 5-8 המלצות אסטרטגיות אופרטיביות (לא כלליות). לכל אחת: רציונל המבוסס על המחקר, מהלך קונקרטי, סיכון, ציפייה להחזר, רוד-מאפ זמן.",
  },
];

export const ANGLE_GROUPS: { id: string; label: string; angles: AngleId[] }[] = [
  {
    id: "market_demand",
    label: "שוק וביקוש",
    angles: ["market_size", "audience", "trends"],
  },
  {
    id: "competition_pricing",
    label: "תחרות ותמחור",
    angles: ["competition", "pricing", "distribution"],
  },
  {
    id: "marketing_tech",
    label: "שיווק וטכנולוגיה",
    angles: ["marketing", "technology"],
  },
  {
    id: "context_strategy",
    label: "הקשר ואסטרטגיה",
    angles: ["regulation", "swot", "opportunities", "recommendations"],
  },
];

export function getAngles(ids: AngleId[]): Angle[] {
  return ANGLES.filter((a) => ids.includes(a.id));
}

export function allAngleIds(): AngleId[] {
  return ANGLES.map((a) => a.id);
}
