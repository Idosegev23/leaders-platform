'use client'

import { useState, useEffect, Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSearchParams } from 'next/navigation'
import axios from 'axios'
import Image from 'next/image'
import StepperWithValidation, { Step } from '@/components/client-brief/StepperWithValidation'
import { FormData, formSchema, formSchemaEn } from '@/types/client-brief'
import { formSteps } from '@/lib/client-brief/formSteps'
import { formStepsEn } from '@/lib/client-brief/formSteps.en'
import { saveFormData, loadFormData, clearFormData } from '@/lib/client-brief/localStorage'

interface LinkData {
  id: string
  token: string
  created_by_email: string
  created_by_name: string | null
  client_email: string | null
  client_name: string | null
  status: string
  metadata: Record<string, unknown>
  created_at: string
  document_type: { slug: string; name: string } | null
}

export default function ClientBriefPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
        </div>
      }
    >
      <BriefContent />
    </Suspense>
  )
}

function BriefContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const langParam = searchParams.get('lang')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [link, setLink] = useState<LinkData | null>(null)
  const [loadingLink, setLoadingLink] = useState(true)

  const lang = (link?.metadata?.language as string) || langParam || 'he'
  const isEnglish = lang === 'en'
  const activeFormSteps = isEnglish ? formStepsEn : formSteps
  const activeSchema = isEnglish ? formSchemaEn : formSchema

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
    trigger,
  } = useForm<FormData>({
    resolver: zodResolver(activeSchema),
    mode: 'onChange',
  })

  // Load link metadata + bump status to 'opened' on first view.
  useEffect(() => {
    if (!token) {
      setLoadingLink(false)
      return
    }
    fetch(`/api/links/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setLink(data))
      .finally(() => setLoadingLink(false))
  }, [token])

  // Restore from localStorage
  useEffect(() => {
    if (!token) return
    const saved = loadFormData(token)
    if (saved) {
      Object.keys(saved).forEach((key) => {
        setValue(key as keyof FormData, saved[key as keyof FormData] as string | string[])
      })
    }
  }, [setValue, token])

  // Auto-save to localStorage
  useEffect(() => {
    if (!token) return
    const sub = watch((value) => {
      saveFormData(value as Partial<FormData>, token)
    })
    return () => sub.unsubscribe()
  }, [watch, token])

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    try {
      const payload: Record<string, unknown> = { ...data }

      if (link) {
        payload._hub_token = link.token
        payload._created_by_email = link.created_by_email
        payload._created_by_name = link.created_by_name
        payload._client_email = link.client_email
        payload._client_name = link.client_name
        payload._sent_at = link.created_at
      }

      const webhookUrl = isEnglish
        ? 'https://hook.eu2.make.com/cpoy8k5bwarv2p3fhzgkkcdtp5qeqq7w'
        : 'https://hook.eu2.make.com/uryu3mv7m9tu3dtbkqto6qfdbnrdbjr0'

      await axios.post(webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
      })

      if (link?.token) {
        fetch(`/api/links/${link.token}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        }).catch(() => {})
      }

      setSubmitSuccess(true)
      clearFormData(token)
    } catch (error) {
      console.error('Error submitting form:', error)
      alert(
        isEnglish
          ? 'An error occurred while submitting the form. Please try again.'
          : 'אירעה שגיאה בשליחת הטופס. אנא נסה שנית.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStepChange = (step: number) => {
    setCurrentStep(step)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Publish progress so the Leaders hub can show "Client is on step N/M".
    if (token) {
      fetch(`/api/links/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          progress: { step, total: activeFormSteps.length },
        }),
      }).catch(() => {})
    }
  }

  const handleNextStep = async (step: number) => {
    const stepConfig = activeFormSteps[step - 1]
    const fieldsToValidate = stepConfig.fields.map((f) => f.name)
    return await trigger(fieldsToValidate)
  }

  const handleFinalStep = () => handleSubmit(onSubmit)()

  if (loadingLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (submitSuccess) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gray-100 p-4"
        dir={isEnglish ? 'ltr' : 'rtl'}
      >
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 text-center max-w-md w-full">
          <div className="w-20 h-20 md:w-24 md:h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-10 h-10 md:w-12 md:h-12 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-4">
            {isEnglish ? 'Form Submitted Successfully' : 'הטופס נשלח בהצלחה'}
          </h2>
          <p className="text-gray-600">
            {isEnglish
              ? 'Thank you for filling out the brief. We will get back to you shortly.'
              : 'תודה על מילוי הבריף. נחזור אליך בהקדם.'}
          </p>
        </div>
      </div>
    )
  }

  // Current step — suppress-unused-warning hack for hooks that caller still expects
  void currentStep
  void isSubmitting

  return (
    <div
      className="min-h-screen bg-gray-100 py-4 md:py-8"
      dir={isEnglish ? 'ltr' : 'rtl'}
      lang={isEnglish ? 'en' : 'he'}
    >
      <div className="max-w-5xl mx-auto px-3 md:px-4 mb-4 md:mb-8">
        <div className="bg-white rounded-lg md:rounded-xl shadow-md p-4 md:p-6 text-center">
          <div className="flex justify-center mb-3 md:mb-4">
            <Image
              src="/logo.png"
              alt="Leaders Logo"
              width={150}
              height={60}
              className="object-contain md:w-[180px] md:h-[72px]"
              priority
            />
          </div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-2">
            {isEnglish ? 'Client Brief Form' : 'טופס בריף ללקוחות'}
          </h1>
          <p className="text-sm md:text-base text-gray-600 px-2">
            {isEnglish
              ? 'Please fill in the details carefully so we can create the perfect campaign for you'
              : 'מלא את הפרטים בקפידה כדי שנוכל ליצור עבורך את המהלך המושלם'}
          </p>
          <div className="mt-3 md:mt-4 inline-flex items-center gap-2 bg-green-50 px-3 md:px-4 py-1.5 md:py-2 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
            <p className="text-xs md:text-sm text-green-700 font-medium">
              {isEnglish
                ? 'Data is auto-saved as you fill in the form'
                : 'הנתונים נשמרים אוטומטית במהלך המילוי'}
            </p>
          </div>
        </div>
      </div>

      <StepperWithValidation
        initialStep={1}
        onStepChange={handleStepChange}
        onNextStep={handleNextStep}
        onFinalStepCompleted={handleFinalStep}
        backButtonText={isEnglish ? 'Back' : 'חזור'}
        nextButtonText={isEnglish ? 'Next' : 'הבא'}
        disableStepIndicators={false}
      >
        {activeFormSteps.map((stepConfig, index) => (
          <Step key={index}>
            <div className="mb-4 md:mb-6">
              <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-800 mb-1 md:mb-2">
                {stepConfig.title}
              </h2>
              <p className="text-sm md:text-base text-gray-600">{stepConfig.description}</p>
            </div>

            {stepConfig.fields.map((field) => {
              const error = errors[field.name]
              return (
                <div key={field.name} className="mb-4 md:mb-6">
                  <label
                    htmlFor={field.name}
                    className="block text-sm md:text-base font-semibold text-gray-700 mb-2"
                  >
                    {field.label}
                    {field.required && (
                      <span className={`text-red-500 ${isEnglish ? 'ml-1' : 'mr-1'}`}>*</span>
                    )}
                  </label>
                  {field.type === 'checkbox-group' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {field.options?.map((option) => (
                        <label
                          key={option}
                          className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-gray-200 hover:border-primary transition-colors"
                        >
                          <input
                            type="checkbox"
                            value={option}
                            {...register(field.name)}
                            className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-2 focus:ring-primary flex-shrink-0"
                          />
                          <span className="text-sm md:text-base text-gray-700">{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : field.type === 'select' ? (
                    <select
                      id={field.name}
                      {...register(field.name)}
                      className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all bg-white ${
                        error ? 'border-red-500' : 'border-gray-300'
                      }`}
                    >
                      <option value="">{isEnglish ? 'Select an option...' : 'בחר אפשרות...'}</option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      id={field.name}
                      {...register(field.name)}
                      placeholder={field.placeholder}
                      rows={4}
                      className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                        error ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  ) : (
                    <input
                      id={field.name}
                      type={field.type}
                      {...register(field.name)}
                      placeholder={field.placeholder}
                      className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                        error ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  )}
                  {error && (
                    <p className="mt-1 text-xs md:text-sm text-red-600 flex items-center gap-1">
                      <svg
                        className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="break-words">{error.message as string}</span>
                    </p>
                  )}
                </div>
              )
            })}
          </Step>
        ))}
      </StepperWithValidation>
    </div>
  )
}
