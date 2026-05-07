'use client'

import React from 'react'

/**
 * Minimal client-side error boundary. Wrap experimental / new sections of a
 * page in <SafeBoundary> so a render-time crash inside the boundary does not
 * white-page the whole route. The user still sees everything around it plus
 * a soft "this section failed — reload to retry" tile.
 */
interface Props {
  children: React.ReactNode
  /** Hebrew label for the error tile. Defaults to a generic message. */
  label?: string
}
interface State {
  err: Error | null
}

export class SafeBoundary extends React.Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error): State {
    return { err }
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('[SafeBoundary] caught:', err, info)
  }

  render() {
    if (this.state.err) {
      return (
        <div dir="rtl" className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-4 text-sm font-heebo">
          <p className="font-bold mb-1">{this.props.label || 'הקטע הזה נתקל בבעיה ולא עלה'}</p>
          <p className="text-xs text-red-700/80 mb-2 leading-relaxed">
            הצנרת המקיפה ממשיכה לעבוד. רענן את הדף כדי לנסות שוב — אם הבעיה חוזרת, הודיע ל-CTO.
          </p>
          <details className="text-[11px] text-red-700/70">
            <summary className="cursor-pointer">פירוט טכני</summary>
            <code className="block mt-1 whitespace-pre-wrap break-words">{this.state.err.message}</code>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}
