'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import FormsList from '@/components/inner-meeting/FormsList'
import InnerMeetingForm from '@/components/inner-meeting/InnerMeetingForm'

export default function InnerMeetingPage() {
  const [selectedFormToken, setSelectedFormToken] = useState<string | undefined>(undefined)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const formToken = params.get('form')
    if (formToken) setSelectedFormToken(formToken)
  }, [])

  const handleSelectForm = (token: string) => {
    setSelectedFormToken(token)
    const url = new URL(window.location.href)
    url.searchParams.set('form', token)
    window.history.pushState({}, '', url.toString())
    setTimeout(() => {
      document.getElementById('form-section')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 py-4 md:py-8">
      <div className="max-w-4xl mx-auto px-3 md:px-4">
        <div className="bg-white rounded-lg md:rounded-xl shadow-md p-4 md:p-6 text-center mb-4 md:mb-8">
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 text-sm">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-800">
              ← חזרה לדשבורד
            </Link>
          </div>

          <div className="flex justify-center mb-3 md:mb-4">
            <Image
              src="/logo.png"
              alt="Leaders"
              width={150}
              height={60}
              className="object-contain md:w-[180px] md:h-[72px]"
              priority
            />
          </div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-2">
            מסמך התנעה – LEADERS 2025
          </h1>
          <p className="text-sm md:text-base text-gray-600 px-2">
            את המסמך הזה אנחנו ממלאים בפגישת בריף פנימית לאחר קבלת הבריף המלא מהלקוח
          </p>
          <p className="text-xs md:text-sm text-gray-500 mt-2">
            אחראים על מילוי המסמך: מנהל הלקוח ואיש קריאייטיב
          </p>
        </div>

        <FormsList onSelectForm={handleSelectForm} />

        <div id="form-section">
          <InnerMeetingForm initialToken={selectedFormToken} />
        </div>
      </div>
    </div>
  )
}
