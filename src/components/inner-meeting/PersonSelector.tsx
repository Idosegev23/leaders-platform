'use client'

import { useState, useEffect, useRef } from 'react'
import type { Contact, SelectedPerson } from '@/types/inner-meeting'
import { searchContacts } from '@/lib/inner-meeting/csvLoader'

interface PersonSelectorProps {
  label: string
  contacts: Contact[]
  selectedPersons: SelectedPerson[]
  onChange: (persons: SelectedPerson[]) => void
  error?: string
  multiSelect?: boolean
}

export default function PersonSelector({
  label,
  contacts,
  selectedPersons,
  onChange,
  error,
  multiSelect = false,
}: PersonSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (searchQuery.trim()) {
      setFilteredContacts(searchContacts(contacts, searchQuery))
      setIsOpen(true)
    } else {
      setFilteredContacts([])
      setIsOpen(false)
    }
  }, [searchQuery, contacts])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectPerson = (contact: Contact) => {
    const person: SelectedPerson = {
      name: `${contact.firstName} ${contact.lastName}`,
      email: contact.email,
      hebrewName: `${contact.hebrewFirstName} ${contact.hebrewLastName}`,
    }

    if (multiSelect) {
      if (!selectedPersons.some((p) => p.email === person.email)) {
        onChange([...selectedPersons, person])
      }
    } else {
      onChange([person])
    }
    setSearchQuery('')
    setIsOpen(false)
  }

  const handleRemovePerson = (email: string) => {
    onChange(selectedPersons.filter((p) => p.email !== email))
  }

  return (
    <div className="mb-6">
      <label className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
        {label}
        <span className="text-red-500 mr-1">*</span>
      </label>

      {selectedPersons.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selectedPersons.map((person) => (
            <div
              key={person.email}
              className="inline-flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-full text-sm"
            >
              <span>{person.hebrewName}</span>
              <button
                type="button"
                onClick={() => handleRemovePerson(person.email)}
                className="hover:bg-primary/80 rounded-full p-0.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative" ref={dropdownRef}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="חפש לפי שם או מייל..."
          className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
            error ? 'border-red-500' : 'border-gray-300'
          }`}
        />

        {isOpen && filteredContacts.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {filteredContacts.map((contact, index) => (
              <button
                key={`${contact.email}-${index}`}
                type="button"
                onClick={() => handleSelectPerson(contact)}
                className="w-full text-right px-4 py-3 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0"
              >
                <div className="font-semibold text-gray-800">
                  {contact.hebrewFirstName} {contact.hebrewLastName}
                </div>
                <div className="text-sm text-gray-600">
                  {contact.firstName} {contact.lastName}
                </div>
                <div className="text-xs text-gray-500">{contact.email}</div>
              </button>
            ))}
          </div>
        )}

        {isOpen && filteredContacts.length === 0 && searchQuery.trim() && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
            לא נמצאו תוצאות
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1 text-xs md:text-sm text-red-600 flex items-center gap-1">
          <svg className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span className="break-words">{error}</span>
        </p>
      )}

      {multiSelect && <p className="mt-2 text-xs text-gray-500">ניתן לבחור מספר אנשים</p>}
    </div>
  )
}
