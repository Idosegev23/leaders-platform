import type { QuoteData, TemplateConfig } from '@/types/documents'
import { formatCurrency, formatShortDate, calculateQuoteTotals } from '@/lib/utils'

interface QuoteTemplateProps {
  data: QuoteData
  config: TemplateConfig
}

export function QuoteTemplate({ data, config }: QuoteTemplateProps) {
  const { client, supplier, quote } = data
  const totals = calculateQuoteTotals(quote.items, quote.vatEnabled, 17)

  return (
    <div 
      className="quote-page"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '15mm',
        backgroundColor: config.colors.background,
        color: config.colors.text,
        fontFamily: config.fonts.body,
        direction: 'rtl',
      }}
    >
      {/* Header */}
      <header 
        className="header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '20mm',
          paddingBottom: '5mm',
          borderBottom: `2px solid ${config.colors.primary}`,
        }}
      >
        <div className="supplier-info">
          {config.logoUrl && (
            <img 
              src={config.logoUrl} 
              alt={supplier.name}
              style={{ height: '50px', marginBottom: '10px' }}
            />
          )}
          <h2 style={{ 
            fontFamily: config.fonts.heading,
            fontSize: '18px',
            fontWeight: 'bold',
            color: config.colors.primary,
            margin: '0 0 5px 0',
          }}>
            {supplier.name}
          </h2>
          {supplier.phone && <p style={{ margin: '2px 0', fontSize: '12px' }}>{supplier.phone}</p>}
          {supplier.email && <p style={{ margin: '2px 0', fontSize: '12px' }}>{supplier.email}</p>}
          {supplier.address && <p style={{ margin: '2px 0', fontSize: '12px' }}>{supplier.address}</p>}
        </div>

        <div className="quote-info" style={{ textAlign: 'left' }}>
          <h1 style={{
            fontFamily: config.fonts.heading,
            fontSize: '28px',
            fontWeight: 'bold',
            color: config.colors.accent,
            margin: '0 0 10px 0',
          }}>
            הצעת מחיר
          </h1>
          <p style={{ fontSize: '14px', margin: '2px 0' }}>
            <strong>מספר:</strong> {quote.id}
          </p>
          <p style={{ fontSize: '14px', margin: '2px 0' }}>
            <strong>תאריך:</strong> {formatShortDate(quote.date)}
          </p>
          <p style={{ fontSize: '14px', margin: '2px 0' }}>
            <strong>בתוקף עד:</strong> {formatShortDate(quote.validUntil)}
          </p>
        </div>
      </header>

      {/* Client Info */}
      <section className="client-section" style={{ marginBottom: '15mm' }}>
        <h3 style={{
          fontFamily: config.fonts.heading,
          fontSize: '14px',
          fontWeight: 'bold',
          color: config.colors.primary,
          marginBottom: '5mm',
        }}>
          לכבוד:
        </h3>
        <div style={{
          padding: '10px 15px',
          backgroundColor: config.colors.primary + '10',
          borderRadius: '8px',
        }}>
          <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0' }}>
            {client.name}
          </p>
          {client.company && <p style={{ margin: '2px 0', fontSize: '12px' }}>{client.company}</p>}
          {client.email && <p style={{ margin: '2px 0', fontSize: '12px' }}>{client.email}</p>}
          {client.phone && <p style={{ margin: '2px 0', fontSize: '12px' }}>{client.phone}</p>}
        </div>
      </section>

      {/* Items Table */}
      <section className="items-section" style={{ marginBottom: '15mm' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12px',
        }}>
          <thead>
            <tr style={{ backgroundColor: config.colors.primary }}>
              <th style={{ 
                padding: '12px 15px', 
                textAlign: 'right', 
                color: 'white',
                fontFamily: config.fonts.heading,
                borderRadius: '8px 0 0 0',
              }}>
                פריט
              </th>
              <th style={{ 
                padding: '12px 15px', 
                textAlign: 'center', 
                color: 'white',
                fontFamily: config.fonts.heading,
                width: '80px',
              }}>
                כמות
              </th>
              <th style={{ 
                padding: '12px 15px', 
                textAlign: 'left', 
                color: 'white',
                fontFamily: config.fonts.heading,
                width: '120px',
              }}>
                מחיר יחידה
              </th>
              <th style={{ 
                padding: '12px 15px', 
                textAlign: 'left', 
                color: 'white',
                fontFamily: config.fonts.heading,
                width: '120px',
                borderRadius: '0 8px 0 0',
              }}>
                סה"כ
              </th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, index) => (
              <tr 
                key={item.id || index}
                style={{ 
                  backgroundColor: index % 2 === 0 ? 'transparent' : config.colors.primary + '05',
                  borderBottom: `1px solid ${config.colors.primary}20`,
                }}
              >
                <td style={{ padding: '12px 15px' }}>
                  <strong>{item.title}</strong>
                  {item.description && (
                    <p style={{ 
                      margin: '5px 0 0 0', 
                      fontSize: '11px', 
                      color: config.colors.text + 'aa',
                    }}>
                      {item.description}
                    </p>
                  )}
                </td>
                <td style={{ padding: '12px 15px', textAlign: 'center' }}>
                  {item.qty}
                </td>
                <td style={{ padding: '12px 15px', textAlign: 'left' }}>
                  {formatCurrency(item.unitPrice)}
                </td>
                <td style={{ 
                  padding: '12px 15px', 
                  textAlign: 'left',
                  fontWeight: 'bold',
                  color: config.colors.accent,
                }}>
                  {formatCurrency(item.qty * item.unitPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Totals */}
      <section className="totals-section" style={{ marginBottom: '15mm' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <div style={{
            width: '250px',
            padding: '15px 20px',
            backgroundColor: config.colors.primary + '10',
            borderRadius: '8px',
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              marginBottom: '8px',
              fontSize: '14px',
            }}>
              <span>סכום ביניים:</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            
            {quote.vatEnabled && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                marginBottom: '8px',
                fontSize: '14px',
              }}>
                <span>מע"מ (17%):</span>
                <span>{formatCurrency(totals.vatAmount)}</span>
              </div>
            )}
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: `2px solid ${config.colors.accent}`,
              fontFamily: config.fonts.heading,
              fontWeight: 'bold',
              fontSize: '18px',
              color: config.colors.accent,
            }}>
              <span>סה"כ לתשלום:</span>
              <span>{formatCurrency(totals.total)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Payment Terms */}
      {quote.paymentTerms && (
        <section className="terms-section" style={{ marginBottom: '10mm' }}>
          <h3 style={{
            fontFamily: config.fonts.heading,
            fontSize: '14px',
            fontWeight: 'bold',
            color: config.colors.primary,
            marginBottom: '3mm',
          }}>
            תנאי תשלום:
          </h3>
          <p style={{ fontSize: '12px', margin: 0 }}>{quote.paymentTerms}</p>
        </section>
      )}

      {/* Notes */}
      {quote.notes && (
        <section className="notes-section" style={{ marginBottom: '10mm' }}>
          <h3 style={{
            fontFamily: config.fonts.heading,
            fontSize: '14px',
            fontWeight: 'bold',
            color: config.colors.primary,
            marginBottom: '3mm',
          }}>
            הערות:
          </h3>
          <p style={{ fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap' }}>{quote.notes}</p>
        </section>
      )}

      {/* Signature */}
      {quote.signatureEnabled && (
        <section className="signature-section" style={{ 
          marginTop: '20mm',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <div style={{ width: '45%' }}>
            <div style={{
              borderTop: `1px solid ${config.colors.primary}`,
              paddingTop: '5mm',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: '12px', margin: 0 }}>חתימת הספק</p>
            </div>
          </div>
          <div style={{ width: '45%' }}>
            <div style={{
              borderTop: `1px solid ${config.colors.primary}`,
              paddingTop: '5mm',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: '12px', margin: 0 }}>חתימת הלקוח</p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export function renderQuoteToHtml(data: QuoteData, config: TemplateConfig): string {
  const { client, supplier, quote } = data
  const totals = calculateQuoteTotals(quote.items, quote.vatEnabled, 17)

  return `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>הצעת מחיר - ${quote.id}</title>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&family=Assistant:wght@400;600;700&family=Rubik:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    @page {
      size: A4;
      margin: 0;
    }
    body {
      font-family: '${config.fonts.body}', sans-serif;
      background: ${config.colors.background};
      color: ${config.colors.text};
      direction: rtl;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 15mm;
      margin: 0 auto;
      background: ${config.colors.background};
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20mm;
      padding-bottom: 5mm;
      border-bottom: 2px solid ${config.colors.primary};
    }
    .supplier-logo {
      height: 50px;
      margin-bottom: 10px;
    }
    .supplier-name {
      font-family: '${config.fonts.heading}', sans-serif;
      font-size: 18px;
      font-weight: bold;
      color: ${config.colors.primary};
      margin-bottom: 5px;
    }
    .supplier-detail {
      font-size: 12px;
      margin: 2px 0;
    }
    .quote-title {
      font-family: '${config.fonts.heading}', sans-serif;
      font-size: 28px;
      font-weight: bold;
      color: ${config.colors.accent};
      margin-bottom: 10px;
    }
    .quote-detail {
      font-size: 14px;
      margin: 2px 0;
    }
    .client-section {
      margin-bottom: 15mm;
    }
    .section-title {
      font-family: '${config.fonts.heading}', sans-serif;
      font-size: 14px;
      font-weight: bold;
      color: ${config.colors.primary};
      margin-bottom: 5mm;
    }
    .client-box {
      padding: 10px 15px;
      background: ${config.colors.primary}10;
      border-radius: 8px;
    }
    .client-name {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .client-detail {
      font-size: 12px;
      margin: 2px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 15mm;
    }
    th {
      padding: 12px 15px;
      background: ${config.colors.primary};
      color: white;
      font-family: '${config.fonts.heading}', sans-serif;
      text-align: right;
    }
    th:first-child { border-radius: 8px 0 0 0; }
    th:last-child { border-radius: 0 8px 0 0; }
    th.center { text-align: center; }
    th.left { text-align: left; }
    td {
      padding: 12px 15px;
      border-bottom: 1px solid ${config.colors.primary}20;
    }
    tr:nth-child(even) {
      background: ${config.colors.primary}05;
    }
    .item-title {
      font-weight: bold;
    }
    .item-desc {
      font-size: 11px;
      color: ${config.colors.text}aa;
      margin-top: 5px;
    }
    .center { text-align: center; }
    .left { text-align: left; }
    .total-cell {
      font-weight: bold;
      color: ${config.colors.accent};
    }
    .totals-container {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 15mm;
    }
    .totals-box {
      width: 250px;
      padding: 15px 20px;
      background: ${config.colors.primary}10;
      border-radius: 8px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .totals-final {
      display: flex;
      justify-content: space-between;
      padding-top: 8px;
      border-top: 2px solid ${config.colors.accent};
      font-family: '${config.fonts.heading}', sans-serif;
      font-weight: bold;
      font-size: 18px;
      color: ${config.colors.accent};
    }
    .terms-section, .notes-section {
      margin-bottom: 10mm;
    }
    .section-content {
      font-size: 12px;
      white-space: pre-wrap;
    }
    .signature-section {
      margin-top: 20mm;
      display: flex;
      justify-content: space-between;
    }
    .signature-box {
      width: 45%;
      border-top: 1px solid ${config.colors.primary};
      padding-top: 5mm;
      text-align: center;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="supplier-info">
        ${config.logoUrl ? `<img src="${config.logoUrl}" alt="${supplier.name}" class="supplier-logo">` : ''}
        <div class="supplier-name">${supplier.name}</div>
        ${supplier.phone ? `<div class="supplier-detail">${supplier.phone}</div>` : ''}
        ${supplier.email ? `<div class="supplier-detail">${supplier.email}</div>` : ''}
        ${supplier.address ? `<div class="supplier-detail">${supplier.address}</div>` : ''}
      </div>
      <div class="quote-info" style="text-align: left;">
        <div class="quote-title">הצעת מחיר</div>
        <div class="quote-detail"><strong>מספר:</strong> ${quote.id}</div>
        <div class="quote-detail"><strong>תאריך:</strong> ${formatShortDate(quote.date)}</div>
        <div class="quote-detail"><strong>בתוקף עד:</strong> ${formatShortDate(quote.validUntil)}</div>
      </div>
    </header>

    <section class="client-section">
      <div class="section-title">לכבוד:</div>
      <div class="client-box">
        <div class="client-name">${client.name}</div>
        ${client.company ? `<div class="client-detail">${client.company}</div>` : ''}
        ${client.email ? `<div class="client-detail">${client.email}</div>` : ''}
        ${client.phone ? `<div class="client-detail">${client.phone}</div>` : ''}
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th>פריט</th>
          <th class="center" style="width: 80px;">כמות</th>
          <th class="left" style="width: 120px;">מחיר יחידה</th>
          <th class="left" style="width: 120px;">סה"כ</th>
        </tr>
      </thead>
      <tbody>
        ${quote.items.map((item, index) => `
          <tr>
            <td>
              <div class="item-title">${item.title}</div>
              ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
            </td>
            <td class="center">${item.qty}</td>
            <td class="left">${formatCurrency(item.unitPrice)}</td>
            <td class="left total-cell">${formatCurrency(item.qty * item.unitPrice)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-container">
      <div class="totals-box">
        <div class="totals-row">
          <span>סכום ביניים:</span>
          <span>${formatCurrency(totals.subtotal)}</span>
        </div>
        ${quote.vatEnabled ? `
          <div class="totals-row">
            <span>מע"מ (17%):</span>
            <span>${formatCurrency(totals.vatAmount)}</span>
          </div>
        ` : ''}
        <div class="totals-final">
          <span>סה"כ לתשלום:</span>
          <span>${formatCurrency(totals.total)}</span>
        </div>
      </div>
    </div>

    ${quote.paymentTerms ? `
      <section class="terms-section">
        <div class="section-title">תנאי תשלום:</div>
        <div class="section-content">${quote.paymentTerms}</div>
      </section>
    ` : ''}

    ${quote.notes ? `
      <section class="notes-section">
        <div class="section-title">הערות:</div>
        <div class="section-content">${quote.notes}</div>
      </section>
    ` : ''}

    ${quote.signatureEnabled ? `
      <section class="signature-section">
        <div class="signature-box">חתימת הספק</div>
        <div class="signature-box">חתימת הלקוח</div>
      </section>
    ` : ''}
  </div>
</body>
</html>
  `.trim()
}





