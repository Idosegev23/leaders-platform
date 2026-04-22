const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to refresh token: ${error}`)
  }

  const data = await res.json()
  return data.access_token
}

export function buildRawEmail(
  from: string,
  fromName: string,
  to: string,
  subject: string,
  htmlBody: string,
): string {
  const boundary = 'boundary_' + Date.now()

  const lines = [
    `From: "${fromName}" <${from}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody).toString('base64'),
    '',
    `--${boundary}--`,
  ]

  return lines.join('\r\n')
}

export async function sendGmailEmail(params: {
  refreshToken: string
  from: string
  fromName: string
  to: string
  subject: string
  html: string
}): Promise<{ messageId: string }> {
  const accessToken = await refreshAccessToken(params.refreshToken)

  const rawEmail = buildRawEmail(params.from, params.fromName, params.to, params.subject, params.html)
  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const gmailRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedEmail }),
    },
  )

  if (!gmailRes.ok) {
    const error = await gmailRes.text()
    throw new Error(`Gmail API error: ${error}`)
  }

  const result = await gmailRes.json()
  return { messageId: result.id }
}
