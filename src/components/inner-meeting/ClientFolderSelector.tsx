'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ClientFolder {
  id: string
  client_name: string
  has_meeting: boolean
}

interface ClientFolderSelectorProps {
  value: string
  onChange: (value: string, folderId?: string) => void
  error?: string
  disabled?: boolean
}

export default function ClientFolderSelector({
  value,
  onChange,
  error,
  disabled,
}: ClientFolderSelectorProps) {
  const [folders, setFolders] = useState<ClientFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [manualMode, setManualMode] = useState(false)

  useEffect(() => {
    fetchFolders()
  }, [])

  const fetchFolders = async () => {
    try {
      const supabase = createClient()
      const { data: foldersData, error: foldersError } = await supabase
        .from('client_folders')
        .select('id, client_name')
        .order('client_name')
      if (foldersError) throw foldersError

      const { data: meetings } = await supabase
        .from('inner_meeting_forms')
        .select('folder_id')
        .not('folder_id', 'is', null)

      const meetingFolderIds = new Set((meetings ?? []).map((m) => m.folder_id))
      const available = (foldersData || [])
        .map((f) => ({ ...f, has_meeting: meetingFolderIds.has(f.id) }))
        .filter((f) => !f.has_meeting)

      setFolders(available)
    } catch (error) {
      console.error('Error fetching folders:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredFolders = folders.filter((f) =>
    f.client_name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleSelect = (folder: ClientFolder) => {
    onChange(folder.client_name, folder.id)
    setIsOpen(false)
    setSearchQuery('')
    setManualMode(false)
  }

  if (loading) {
    return (
      <div className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm">
        טוען לקוחות...
      </div>
    )
  }

  if (manualMode) {
    return (
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="הזן שם לקוח"
          autoFocus
          className={`w-full px-4 py-3 border-2 rounded-lg transition-all ${
            error ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
          }`}
        />
        <button
          type="button"
          onClick={() => {
            setManualMode(false)
            onChange('')
          }}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800"
        >
          חזור לרשימה
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-4 py-3 border-2 rounded-lg text-right flex items-center justify-between transition-all ${
          error
            ? 'border-red-500'
            : isOpen
            ? 'border-blue-500 ring-2 ring-blue-200'
            : 'border-gray-300 hover:border-gray-400'
        } ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white cursor-pointer'}`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-500'}>
          {value || 'בחר לקוח מהרשימה...'}
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש לקוח..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>

          <div className="overflow-y-auto max-h-48">
            {filteredFolders.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                {folders.length === 0 ? 'אין לקוחות ממתינים לפגישת התנעה' : 'לא נמצאו תוצאות'}
              </div>
            ) : (
              filteredFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => handleSelect(folder)}
                  className="w-full px-4 py-3 text-right hover:bg-blue-50 transition-colors"
                >
                  <span className="font-medium text-gray-900">{folder.client_name}</span>
                </button>
              ))
            )}
          </div>

          <div className="p-2 border-t border-gray-100 bg-gray-50">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                setManualMode(true)
              }}
              className="w-full text-center text-sm text-blue-600 hover:text-blue-800"
            >
              או הזן שם לקוח ידנית
            </button>
          </div>
        </div>
      )}

      {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
    </div>
  )
}
