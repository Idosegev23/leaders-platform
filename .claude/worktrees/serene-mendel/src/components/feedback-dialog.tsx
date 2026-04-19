'use client'

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface FeedbackDialogProps {
  documentId: string
  isOpen: boolean
  onClose: () => void
}

const FEEDBACK_TAGS = [
  'עיצוב מצוין',
  'תוכן חד',
  'אסטרטגיה מדויקת',
  'חסר פירוט',
  'גנרי מדי',
  'עיצוב לא מתאים',
  'נתונים לא מדויקים',
  'ארוך מדי',
]

export default function FeedbackDialog({ documentId, isOpen, onClose }: FeedbackDialogProps) {
  const [rating, setRating] = useState(0)
  const [whatWorked, setWhatWorked] = useState('')
  const [whatDidntWork, setWhatDidntWork] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }, [])

  const handleSubmit = useCallback(async () => {
    if (rating === 0) return
    setIsSubmitting(true)
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          rating,
          whatWorked,
          whatDidntWork,
          tags: selectedTags,
        }),
      })
      setIsSubmitted(true)
      setTimeout(onClose, 1500)
    } catch {
      // Silent fail
    } finally {
      setIsSubmitting(false)
    }
  }, [documentId, rating, whatWorked, whatDidntWork, selectedTags, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div dir="rtl" className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-wizard-border bg-white shadow-wizard-xl p-6 space-y-6">
        {isSubmitted ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🎉</div>
            <h3 className="text-lg font-heebo font-bold text-wizard-text-primary">תודה על הפידבק!</h3>
            <p className="text-sm text-wizard-text-tertiary mt-1">זה עוזר לנו לשפר את האיכות</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heebo font-bold text-wizard-text-primary">
                דרגו את ההצעה
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-wizard-text-tertiary hover:bg-brand-pearl transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Rating stars */}
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="transition-transform hover:scale-110"
                >
                  <svg
                    className={cn('h-10 w-10', star <= rating ? 'text-amber-400' : 'text-wizard-border')}
                    fill={star <= rating ? 'currentColor' : 'none'}
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </button>
              ))}
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 justify-center">
              {FEEDBACK_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                    selectedTags.includes(tag)
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-wizard-border text-wizard-text-tertiary hover:border-accent/30'
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Text feedback */}
            <Textarea
              label="מה עבד טוב?"
              placeholder="מה בלט לטובה בהצעה..."
              value={whatWorked}
              onChange={(e) => setWhatWorked(e.target.value)}
              className="min-h-[60px]"
            />

            <Textarea
              label="מה לשפר?"
              placeholder="מה הייתם רוצים לשנות או לשפר..."
              value={whatDidntWork}
              onChange={(e) => setWhatDidntWork(e.target.value)}
              className="min-h-[60px]"
            />

            {/* Submit */}
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={rating === 0 || isSubmitting}
              isLoading={isSubmitting}
              className="w-full"
            >
              שלח פידבק
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
