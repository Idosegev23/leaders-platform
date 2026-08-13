/**
 * ספריית המסמכים של לידרס — אינדקס סטטי של כל מסמכי העבודה
 * (Google Sheets/Docs, Canva, Drive וכו') עד שיהפכו למקוונים בתוך המערכת.
 *
 * מקור אמת: הקובץ הזה. הוספת מסמך = שורה חדשה במערך + דיפלוי.
 * `kind: 'internal'` מסמן מסך שכבר קיים בתוך הפלטפורמה (קישור פנימי).
 */

export type DocKind =
  | 'sheet'    // Google Sheets
  | 'doc'      // Google Docs
  | 'canva'    // Canva design
  | 'drive'    // Google Drive folder
  | 'form'     // Google Form
  | 'video'    // הקלטה / tldv
  | 'internal' // מסך בתוך הפלטפורמה

export type LibraryDoc = {
  category: string
  name: string
  url: string | null
  kind: DocKind | null
}

export const KIND_LABELS: Record<DocKind, string> = {
  sheet: 'גיליון',
  doc: 'מסמך',
  canva: 'Canva',
  drive: 'תיקייה',
  form: 'טופס',
  video: 'הקלטה',
  internal: 'במערכת',
}

export const LIBRARY_DOCS: LibraryDoc[] = [
  // ── תהליך כניסת בריף חדש ──────────────────────────────
  { category: 'תהליך כניסת בריף חדש', name: 'תהליך כניסת בריף חדש', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1j7sRSoH6ZxSMXuuikk05Qxewz3tH0jfQuci_Lw_6lkA/edit?gid=0' },
  { category: 'תהליך כניסת בריף חדש', name: 'בריף לקוח — שליחה ללקוח', kind: 'internal', url: '/send/client-brief' },
  { category: 'תהליך כניסת בריף חדש', name: 'פגישת התנעה (בריף פנימי)', kind: 'internal', url: '/inner-meeting#form-section' },
  { category: 'תהליך כניסת בריף חדש', name: 'תיק ניהול לדוגמא', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1nkg6jwjRHSJApLhMU8yO9HidTbZbXo-yIizNRo-3CD4/edit' },
  { category: 'תהליך כניסת בריף חדש', name: 'גאנט לדוגמא', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/114pembbc-GDul_q8bxhwaxhYPlmSWsZ9nkS5pOsFufg/edit' },
  { category: 'תהליך כניסת בריף חדש', name: 'מצגת לידרס', kind: 'canva', url: 'https://www.canva.com/design/DAGRGJuLvfk/PKFnAYAhpvhOZtN3YwduWw/edit' },
  { category: 'תהליך כניסת בריף חדש', name: 'טמפלט מצגת ליהוקים', kind: null, url: null },
  { category: 'תהליך כניסת בריף חדש', name: 'טמפלט מצגת סיכום', kind: 'canva', url: 'https://www.canva.com/design/DAGrER02bEE/-oHFXF3bln3Wx66Bm6-Khg/edit' },
  { category: 'תהליך כניסת בריף חדש', name: 'תיקיית דרייב להעתקה', kind: 'drive', url: 'https://drive.google.com/drive/folders/1y5loCz9w-cJpkFL_Suz0YMfeO87Lp6W_' },
  { category: 'תהליך כניסת בריף חדש', name: 'הסבר לפתיחת קמפיין IMAI', kind: 'video', url: 'https://tldv.io/app/meetings/67f501b91eaf860013f6d013/' },

  // ── בריף משפיענים ─────────────────────────────────────
  { category: 'בריף משפיענים', name: 'בריף משפיענים', kind: 'canva', url: 'https://www.canva.com/design/DAGrEkgBsuM/2cpzydemDFrSGoDAqdqLcA/edit' },
  { category: 'בריף משפיענים', name: 'בריף משפיעני הפצה', kind: 'canva', url: 'https://www.canva.com/design/DAGrEaY7gsM/Q4uzpHJlMOqSM8vGBBejlg/edit' },

  // ── הצעות מחיר ────────────────────────────────────────
  { category: 'הצעות מחיר', name: 'טמפלט הצעת מחיר משפיענים', kind: 'canva', url: 'https://www.canva.com/design/DAF3VzCRSiU/v-x9kTYueEXD_jX40oueYA/edit' },
  { category: 'הצעות מחיר', name: 'טמפלט הצעת מחיר רזה', kind: 'canva', url: 'https://www.canva.com/design/DAGquW56MLI/eLu_UkPTI_Mz3T8553n0Ag/edit' },
  { category: 'הצעות מחיר', name: 'טמפלט הצעת מחיר עם סושיאל', kind: 'canva', url: 'https://www.canva.com/design/DAGsGHQ_vnk/zppV1_8bxU2g1dRzynP-yA/edit' },
  { category: 'הצעות מחיר', name: 'איך מחשבים CPE', kind: 'doc', url: 'https://docs.google.com/document/d/11yHruxG0Cq03O5G3VbHyfQacpJqAFaOU/edit' },

  // ── הסכמים ────────────────────────────────────────────
  { category: 'הסכמים', name: 'הסכם פשוט', kind: 'doc', url: 'https://docs.google.com/document/d/1vxec4sMxtQnhDFgTp5ji3c5gnLKdfeJz/edit' },
  { category: 'הסכמים', name: 'הסכם מפורט', kind: 'doc', url: 'https://docs.google.com/document/d/1vUZRbGOFSW_pTX3kl75fCJvURZXKIaIR/edit' },
  { category: 'הסכמים', name: "הצעת מחיר וואן פייג' לחתימה", kind: 'canva', url: 'https://www.canva.com/design/DAGjSzml2jk/D-LWSKTRsW3QHUFADTgxhw/edit' },

  // ── הפקות וימי צילום ──────────────────────────────────
  { category: 'הפקות וימי צילום', name: 'מסמך ספקים מעודכן 2025', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1mQbtLttv7h6ndQwQYF0DilluL5794UzHD-g4P0aLMrk/edit' },
  { category: 'הפקות וימי צילום', name: 'מצגת תיק הפקה', kind: 'canva', url: 'https://www.canva.com/design/DAGlPkbmq4w/bcz9v2Zcr7I_O8yYvJom8A/edit' },
  { category: 'הפקות וימי צילום', name: "צ'ק ליסט להפקות קטנות עצמאיות", kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/13pTlI7Fa5KBRmcjWgCRL1QGmH-JtnLFimmu7g50R2eo/edit' },
  { category: 'הפקות וימי צילום', name: 'תיק הפקה לדוגמא', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1o4bHcmvzvSTtE4snev_c0W51VKdyAc4het2_mDD9LhE/edit' },
  { category: 'הפקות וימי צילום', name: "צ'ק ליסט להפקות", kind: 'doc', url: 'https://docs.google.com/document/d/11d_63KMTGa1Z-gsJSJcXcyCIuRlFJM7r/edit' },
  { category: 'הפקות וימי צילום', name: 'הסכם ספק', kind: 'doc', url: 'https://docs.google.com/document/d/1Hcpk-2iNqageOQ28lZNvZFo-3mV4WXVU/edit' },
  { category: 'הפקות וימי צילום', name: 'שוטינג סקריפט', kind: 'doc', url: 'https://docs.google.com/document/d/1Yo1EnNzUjcuSA_iFRjvmSyksqmdzvo5C/edit' },

  // ── סושיאל ────────────────────────────────────────────
  { category: 'סושיאל', name: 'בריף יוצרת תוכן', kind: 'doc', url: 'https://docs.google.com/document/d/1BkqL9nHtwcUIs-ZvEDjBt749TIxUm-PW/edit' },
  { category: 'סושיאל', name: 'בריף דיוורים', kind: 'doc', url: 'https://docs.google.com/document/d/1JJ62zrLjItlAQ3iV2vDq57ygUo6qXlw-/edit' },
  { category: 'סושיאל', name: 'בריף סושיאל — פוסטים וסטוריז', kind: 'doc', url: 'https://docs.google.com/document/d/1lCL0o-WUa7mIJ1FMtcO70NswgOCuebgs/edit' },
  { category: 'סושיאל', name: 'בריף סושיאל — טיקטוק', kind: 'doc', url: 'https://docs.google.com/document/d/1NX4dHreUtyvyhtqpacSK4nn5yWbpY4wb/edit' },
  { category: 'סושיאל', name: 'בריף באנרים', kind: 'doc', url: 'https://docs.google.com/document/d/1p_2N9hPA8JGUx0kgQTTmXaD1TYrk23PxATMaXhe9MAI/edit' },
  { category: 'סושיאל', name: 'תקנון קבוצת פייסבוק', kind: 'doc', url: 'https://docs.google.com/document/d/1MqyEj7LKxjIQRfMf8HLGUOr3x9qixIt1/edit' },
  { category: 'סושיאל', name: 'תקנון הגרלה אינסטגרם', kind: 'doc', url: 'https://docs.google.com/document/d/1v-F91X9NrwlFEY6EH2L8yl0LBCKfmVts/edit' },
  { category: 'סושיאל', name: 'בריף עיצוב', kind: null, url: null },
  { category: 'סושיאל', name: 'בריף מודעות קידום ממומן', kind: 'doc', url: 'https://docs.google.com/document/d/1YZ_dlqZOVzxe3n0n8DU7QCPAxvK9-lnkuhH9W181SeE/edit' },
  { category: 'סושיאל', name: 'גאנט מועדים חשובים בשנה', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1hXYJVi5uSsWFFbcpGWecGI3QY5YXHUWm3N05DM59kSc/edit' },
  { category: 'סושיאל', name: 'גאנט סושיאל לדוגמא', kind: 'canva', url: 'https://www.canva.com/design/DAGrHOwAwu4/6IDHHhcJ6hABk3UMGYxwUQ/edit' },
  { category: 'סושיאל', name: 'רשימת תוצרים שנשלחת ללקוח 360', kind: 'doc', url: 'https://docs.google.com/document/d/1bOLdJwy-kGVpHRzPfxlRcf-29KZEA-4PlEetOT_5AT4/edit' },
  { category: 'סושיאל', name: 'קליטת לקוח דיגיטל 360 — בריף מקיף', kind: 'doc', url: 'https://docs.google.com/document/d/1Dyp4VfO0tR0poSe57obAk9ANKWpPs494W3nPSECHj4c/edit' },

  // ── קריאייטיב ─────────────────────────────────────────
  { category: 'קריאייטיב', name: 'מסמך קריאייטיב לפרילנס', kind: 'doc', url: 'https://docs.google.com/document/d/1FCmpG6AUHlSLcAzkCOKDDROLB5TsBFE9ydB8Yk9SVuA/edit' },
  { category: 'קריאייטיב', name: 'טמפלט מצגת קריאייטיב', kind: 'canva', url: 'https://www.canva.com/design/DAGsGmr51Eg/5-QyF5P09GyBE20JK92OAQ/edit' },
  { category: 'קריאייטיב', name: 'ספריית פרויקטים מוצלחים 2022–2024', kind: 'drive', url: 'https://drive.google.com/drive/folders/1AUx0UGucPALSreSL6-rOlD4F_xOeTtEG' },

  // ── מדיה ──────────────────────────────────────────────
  { category: 'מדיה', name: 'בריף מדיה', kind: 'doc', url: 'https://docs.google.com/document/d/18r7uM1XCiZC4x_2ckEjvpg_6lkEXp6n4/edit' },
  { category: 'מדיה', name: 'פריסת מדיה', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1sJM5O_ZZDAFTh10vJq08GgDPDJl5UZrEIQDuOjrinmg/edit' },
  { category: 'מדיה', name: 'קמפיין חיפוש גוגל', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1URmUVkYofDFjmu6lYkjo-WkesVqD6cNX4BeSOslIRBU/edit' },
  { category: 'מדיה', name: 'טבלת קריאייטיב', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1jgo5NL9-2l5qyGfxPS6zHCY9qJAjCxknlwq-gPjrEGU/edit' },
  { category: 'מדיה', name: 'בריף פרפורמנס לקליטת לקוח', kind: 'doc', url: 'https://docs.google.com/document/d/1Z_GGxzo4pT-OShnv4QdQ9OKI7jwFXcJfL4BAcQZYiqQ/edit' },
  { category: 'מדיה', name: 'קמפיין Pmax', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1dNtRLvIJL8oYLCr_sjmWiZUpt4JRhPQTBfJYpH8LZ88/edit' },
  { category: 'מדיה', name: 'קמפיין דיספליי', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1dNtRLvIJL8oYLCr_sjmWiZUpt4JRhPQTBfJYpH8LZ88/edit' },
  { category: 'מדיה', name: 'קמפיין דימנד ג׳ן', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1dNtRLvIJL8oYLCr_sjmWiZUpt4JRhPQTBfJYpH8LZ88/edit' },

  // ── משאבי אנוש ────────────────────────────────────────
  { category: 'משאבי אנוש', name: 'לידרס 2025 + חזון החברה', kind: 'doc', url: 'https://docs.google.com/document/d/15PaCg-C0oSl-LoypL1sH6S_ONK5st1MEbRjlhpW_SJI/edit' },
  { category: 'משאבי אנוש', name: 'נוהל פתיחת משרד', kind: 'doc', url: 'https://docs.google.com/document/d/1QBK8pG_nBJisKK41uNnRFCxzp9Mdo8RR/edit' },
  { category: 'משאבי אנוש', name: 'חפיפה אדמיניסטרציה', kind: 'doc', url: 'https://docs.google.com/document/d/1cORtlk1A4CUbRqJMcjFK0rVp24--waVXOreBwDmGRpU/edit' },
  { category: 'משאבי אנוש', name: 'טופס טיולים יוצא', kind: 'doc', url: 'https://docs.google.com/document/d/1PI81JbniCWhdlyiONHgYWzpsmuoYqQgpEH8RCUPEXRI/edit' },
  { category: 'משאבי אנוש', name: 'טופס טיולים נכנס', kind: 'doc', url: 'https://docs.google.com/document/d/1dzSEod5O2KoqcUql4fSvC8Bi0tpf9KVZ27AQHotUujI/edit' },
  { category: 'משאבי אנוש', name: 'מחשוב לעובד — פתיחת יוזר', kind: 'doc', url: 'https://docs.google.com/document/d/1NPz4iPcQFvUwBIVpggAzmpLRYw-TPHn3/edit' },
  { category: 'משאבי אנוש', name: 'משאבי אנוש — חפיפה', kind: 'doc', url: 'https://docs.google.com/document/d/1qNYUPviSswrJ_ucSGhxG9lfpKFRCp98v/edit' },
  { category: 'משאבי אנוש', name: 'פרטים להכנת הסכם עבודה', kind: 'doc', url: 'https://docs.google.com/document/d/1CgeSA4iG2Wb7reYL-UngM-ag-wW1m3TKVq6cEsQAHyc/edit' },
  { category: 'משאבי אנוש', name: 'ספריית גיוסים + תיאורי משרות', kind: 'drive', url: 'https://drive.google.com/drive/folders/1cG4mXABhqIL88mZTBGxuK4x7jk-N5cdR' },
  { category: 'משאבי אנוש', name: 'קליטה ועזיבה מול הפנסיה', kind: 'drive', url: 'https://drive.google.com/drive/folders/1v5n6XTOJPRiP1RfCpNUy4mZSwX1n10nH' },
  { category: 'משאבי אנוש', name: 'תהליך גיוס עובד לחברה', kind: 'doc', url: 'https://docs.google.com/document/d/12hiEYL4LUFeuLcMKDtpYXYRPfkXYcoec/edit' },
  { category: 'משאבי אנוש', name: 'נהלי חברה', kind: 'doc', url: 'https://docs.google.com/document/d/1Ww_Mwr6xWFtCRWr_2DZYTBiPkqlIyhK2PmrbpXgDClk/edit' },
  { category: 'משאבי אנוש', name: 'רשימת כנסים', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1kN0xR_YdGg-TV8If3WJLxGRISXalkfTa7yHAwDz8irc/edit' },
  { category: 'משאבי אנוש', name: 'תיק חפיפה', kind: 'doc', url: 'https://docs.google.com/document/d/1ibVcEUnEXkGzC_0CEeLXnoSzfkbKlRJ33V3kDD0XCgQ/edit' },
  { category: 'משאבי אנוש', name: 'תיק חפיפה — ספרייה', kind: 'drive', url: 'https://drive.google.com/drive/folders/1O0vhOaszhVJNR6wVSMRQJaX01L7TI__4' },
  { category: 'משאבי אנוש', name: 'מסמכי חברה כלליים למנהל לקוח', kind: 'drive', url: 'https://drive.google.com/drive/folders/1qDZdBMuvRGob8JuWfVa6KHOsSP0vQmRY' },
  { category: 'משאבי אנוש', name: "איזה פגישות יש בכל צוות ומה האג'נדה", kind: 'drive', url: 'https://drive.google.com/drive/folders/1fFqxIVbAeZ7W2vAIsXCsrcpoK6DMlnPx' },
  { category: 'משאבי אנוש', name: 'הגדרות תפקיד', kind: null, url: null },
  { category: 'משאבי אנוש', name: 'טמפלט סיכום שבועי ימי חמישי — מנהל', kind: 'doc', url: 'https://docs.google.com/document/d/1CtWgfygi2V-OSqeU17gAV9c8bpkwllsQ/edit' },
  { category: 'משאבי אנוש', name: 'טמפלט סיכום שבועי ימי חמישי — עובד', kind: 'doc', url: 'https://docs.google.com/document/d/1-LdagruQRc1JXNLiPeDFpuC2P31XWkEB/edit' },
  { category: 'משאבי אנוש', name: 'העברת לקוח בין מנהלים בחברה', kind: null, url: null },

  // ── כספים ─────────────────────────────────────────────
  { category: 'כספים', name: 'טבלת תשלומים — או דאטה פלוס', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/18GpXR3Xuj5zspbCp34bTMwr3HoR6Pr-4viJqDUxqMls/edit' },
  { category: 'כספים', name: 'נוהל תשלומים', kind: 'doc', url: 'https://docs.google.com/document/d/13EV9zHFl_DYMool-ugpzh5zh1lPEyHWLFtkZWBUmNKw/edit' },
  { category: 'כספים', name: 'מסמך לספק — לינק לתשלום', kind: 'form', url: 'https://docs.google.com/forms/d/e/1FAIpQLScxeSJI0g8dCRNN4WFJKM9SfYzi7aFmMFisgZkBy3ERghQr5A/viewform' },
  { category: 'כספים', name: 'תהליך עבודה כספים — דאטה', kind: 'doc', url: 'https://docs.google.com/document/d/1cqu0jwLcE9YUFFwSerBKZYbLXgvATqiBYa8xqGeGFJE/edit' },

  // ── פגישות ────────────────────────────────────────────
  { category: 'פגישות', name: 'טמפלט סיכום פגישה גנרי', kind: 'doc', url: 'https://docs.google.com/document/d/1nR-LYYE3psonLThecZDA94EsaWsLVQlT/edit' },
  { category: 'פגישות', name: 'טמפלט סיכום פגישת הנהלה', kind: 'doc', url: 'https://docs.google.com/document/d/19fQs3jetyvyh6gAcWM7WdvdhDkyQPY-b/edit' },
  { category: 'פגישות', name: 'טמפלט סיכום סטטוס לקוח', kind: 'doc', url: 'https://docs.google.com/document/d/1YmDJhqCaBhTpxXqnH2HuwQJ1X2cwPR3k/edit' },
]

/** סדר הקטגוריות כפי שהוגדר — נגזר מסדר ההופעה במערך */
export const LIBRARY_CATEGORIES: string[] = LIBRARY_DOCS.reduce<string[]>((acc, d) => {
  if (!acc.includes(d.category)) acc.push(d.category)
  return acc
}, [])
