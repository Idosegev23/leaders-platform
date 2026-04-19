'use client'

import { usePresence } from '@/hooks/inner-meeting/usePresence'

interface Props {
  formId: string | null
}

export default function ActiveEditorsIndicator({ formId }: Props) {
  const { activeCount, isConnected } = usePresence(formId)

  if (!formId || !isConnected || activeCount <= 1) return null

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-3 md:p-4 mb-4">
      <div className="flex items-center gap-2 text-green-700">
        <span className="flex h-3 w-3 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
        </span>
        <span className="font-semibold">
          {activeCount - 1 === 1 ? 'עורך אחד נוסף' : `${activeCount - 1} אנשים נוספים`} עורכים כעת
        </span>
      </div>
    </div>
  )
}
