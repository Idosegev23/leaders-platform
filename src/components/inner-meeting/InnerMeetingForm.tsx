'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { InnerMeetingFormData, innerMeetingSchema, Contact } from '@/types/inner-meeting'
import { loadContacts } from '@/lib/inner-meeting/csvLoader'
import PersonSelector from '@/components/inner-meeting/PersonSelector'
import ClientFolderSelector from '@/components/inner-meeting/ClientFolderSelector'
import ActiveEditorsIndicator from '@/components/inner-meeting/ActiveEditorsIndicator'
import FormActivityLog from '@/components/inner-meeting/FormActivityLog'
import { useRealtimeForm } from '@/hooks/inner-meeting/useRealtimeForm'
import { useInnerMeetingUser } from '@/hooks/inner-meeting/useInnerMeetingUser'
import { completeForm, createFormDraft, logActivity, updateFormData } from '@/lib/inner-meeting/formService'
import type { InnerMeetingForm as InnerMeetingFormType } from '@/lib/inner-meeting/types'

interface InnerMeetingFormProps {
  initialToken?: string
}

export default function InnerMeetingForm({ initialToken }: InnerMeetingFormProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingSubmitData, setPendingSubmitData] = useState<InnerMeetingFormData | null>(null)
  const [showDraftNameDialog, setShowDraftNameDialog] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  const { form, innerForm, updateField, initializeForm } = useRealtimeForm()
  const { user } = useInnerMeetingUser()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    setValue,
  } = useForm<InnerMeetingFormData>({
    resolver: zodResolver(innerMeetingSchema),
    defaultValues: {
      participants: [],
      creativeWriter: [],
      presenter: [],
      presentationMaker: [],
      accountManager: [],
      mediaPerson: [],
    }
  })

  // Watch all form fields for changes
  const watchedFields = watch()

  // Load contacts on mount
  useEffect(() => {
    loadContacts().then((data) => {
      setContacts(data)
      setIsLoading(false)
    })
  }, [])

  // Initialize form if token is provided
  useEffect(() => {
    if (initialToken) {
      initializeForm(initialToken)
    }
  }, [initialToken, initializeForm])

  // Sync innerForm data to react-hook-form (only when innerForm changes from null to data)
  const prevInnerFormRef = useRef<InnerMeetingFormType | null>(null)
  const isInitialSync = useRef(false)
  
  useEffect(() => {
    if (innerForm && prevInnerFormRef.current?.id !== innerForm.id) {
      // New form loaded, update all fields
      isInitialSync.current = true
      setValue('clientName', innerForm.client_name || '')
      setValue('meetingDate', innerForm.meeting_date || '')
      setValue('aboutBrand', innerForm.about_brand || '')
      setValue('targetAudiences', innerForm.target_audiences || '')
      setValue('goals', innerForm.goals || '')
      setValue('insight', innerForm.insight || '')
      setValue('strategy', innerForm.strategy || '')
      setValue('mediaStrategy', innerForm.media_strategy || '')
      setValue('creative', innerForm.creative || '')
      setValue('creativePresentation', innerForm.creative_presentation || '')
      setValue('influencersExample', innerForm.influencers_example || '')
      setValue('additionalNotes', innerForm.additional_notes || '')
      setValue('budgetDistribution', innerForm.budget_distribution || '')
      setValue('creativeDeadline', innerForm.creative_deadline || '')
      setValue('internalDeadline', innerForm.internal_deadline || '')
      setValue('clientDeadline', innerForm.client_deadline || '')
      
      prevInnerFormRef.current = innerForm
      
      // Reset the flag after a short delay to allow setValue to complete
      setTimeout(() => {
        isInitialSync.current = false
      }, 100)
    }
  }, [innerForm, setValue])



  const handleSaveDraft = async () => {
    // If no form exists, show dialog to create new draft
    if (!form || !innerForm) {
      setShowDraftNameDialog(true)
      return
    }

    // If form exists, save the updates
    setIsSaving(true)
    try {
      // Prepare all data to save
      const dataToSave: any = {
        folder_id: selectedFolderId || null,
        client_name: watchedFields.clientName || null,
        meeting_date: watchedFields.meetingDate || null,
        about_brand: watchedFields.aboutBrand || null,
        target_audiences: watchedFields.targetAudiences || null,
        goals: watchedFields.goals || null,
        insight: watchedFields.insight || null,
        strategy: watchedFields.strategy || null,
        media_strategy: watchedFields.mediaStrategy || null,
        creative: watchedFields.creative || null,
        creative_presentation: watchedFields.creativePresentation || null,
        influencers_example: watchedFields.influencersExample || null,
        additional_notes: watchedFields.additionalNotes || null,
        budget_distribution: watchedFields.budgetDistribution || null,
        creative_deadline: watchedFields.creativeDeadline || null,
        internal_deadline: watchedFields.internalDeadline || null,
        client_deadline: watchedFields.clientDeadline || null,
      }

      // Import updateFormData here
      
      const success = await updateFormData(form.id, innerForm.id, dataToSave)
      
      if (success) {
        // Log activity
        if (user) {
          await logActivity(form.id, user.email, user.hebrewName, 'save_draft')
        }
        alert('הטיוטה נשמרה בהצלחה')
        
        // Update innerForm state to match saved data
        Object.keys(dataToSave).forEach(key => {
          updateField(key, dataToSave[key])
        })
      } else {
        alert('שגיאה בשמירת הטיוטה')
      }
    } catch (error) {
      console.error('Error saving draft:', error)
      alert('שגיאה בשמירת הטיוטה')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateDraft = async () => {
    if (!draftName.trim()) {
      alert('נא להזין שם לטיוטה')
      return
    }

    setIsSaving(true)
    try {
      // Create the draft
      const draft = await createFormDraft(draftName.trim())
      if (!draft) {
        throw new Error('Failed to create draft')
      }

      // Prepare all data to save
      const dataToSave: any = {
        folder_id: selectedFolderId || null,
        client_name: watchedFields.clientName || null,
        meeting_date: watchedFields.meetingDate || null,
        about_brand: watchedFields.aboutBrand || null,
        target_audiences: watchedFields.targetAudiences || null,
        goals: watchedFields.goals || null,
        insight: watchedFields.insight || null,
        strategy: watchedFields.strategy || null,
        media_strategy: watchedFields.mediaStrategy || null,
        creative: watchedFields.creative || null,
        creative_presentation: watchedFields.creativePresentation || null,
        influencers_example: watchedFields.influencersExample || null,
        additional_notes: watchedFields.additionalNotes || null,
        budget_distribution: watchedFields.budgetDistribution || null,
        creative_deadline: watchedFields.creativeDeadline || null,
        internal_deadline: watchedFields.internalDeadline || null,
        client_deadline: watchedFields.clientDeadline || null,
      }

      // Save the form data
      
      await updateFormData(draft.form.id, draft.innerForm.id, dataToSave)

      // Log activity
      if (user) {
        await logActivity(draft.form.id, user.email, user.hebrewName, 'save_draft')
      }

      // Update URL with share token
      const url = new URL(window.location.href)
      url.searchParams.set('form', draft.form.share_token)
      window.history.pushState({}, '', url.toString())

      // Initialize the form with the new token (this will load it and set up presence)
      await initializeForm(draft.form.share_token)

      alert('הטיוטה נוצרה ונשמרה בהצלחה')
      setShowDraftNameDialog(false)
      setDraftName('')
    } catch (error) {
      console.error('Error creating draft:', error)
      alert('שגיאה ביצירת הטיוטה')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmitClick = (data: InnerMeetingFormData) => {
    setPendingSubmitData(data)
    setShowConfirmDialog(true)
  }

  const confirmSubmit = async () => {
    if (!pendingSubmitData || !form) return

    setIsSubmitting(true)
    setShowConfirmDialog(false)

    try {
      const success = await completeForm(form.id, pendingSubmitData)
      
      if (success) {
        // Log activity
        if (user) {
          await logActivity(form.id, user.email, user.hebrewName, 'submit')
        }
        alert('הטופס נשלח בהצלחה')
        window.location.href = '/'
      } else {
        throw new Error('Failed to complete form')
      }
    } catch (error) {
      console.error('Error submitting form:', error)
      alert('אירעה שגיאה בשליחת הטופס. אנא נסה שנית.')
    } finally {
      setIsSubmitting(false)
      setPendingSubmitData(null)
    }
  }


  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-gray-600">טוען נתונים...</p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-lg md:rounded-xl shadow-md p-4 md:p-8">
        <ActiveEditorsIndicator formId={form?.id || null} />
        <FormActivityLog formId={form?.id || null} />

        <form onSubmit={handleSubmit(handleSubmitClick)}>
          {/* פרטים כלליים */}
          <div className="mb-8">
            <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">
              פרטים כלליים
            </h2>

            <div className="mb-6">
              <label htmlFor="clientName" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                שם הלקוח
                <span className="text-red-500 mr-1">*</span>
                <span className="text-xs text-gray-500 font-normal mr-2">(בחר מרשימת לקוחות עם בריף)</span>
              </label>
              <Controller
                name="clientName"
                control={control}
                render={({ field }) => (
                  <ClientFolderSelector
                    value={field.value || ''}
                    onChange={(value, folderId) => {
                      field.onChange(value)
                      if (folderId) {
                        setSelectedFolderId(folderId)
                      }
                    }}
                    error={errors.clientName?.message}
                  />
                )}
              />
              {errors.clientName && (
                <p className="mt-1 text-xs md:text-sm text-red-600">{errors.clientName.message}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="meetingDate" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                תאריך פגישה פנימית
                <span className="text-red-500 mr-1">*</span>
              </label>
              <input
                id="meetingDate"
                type="date"
                {...register('meetingDate')}
                className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                  errors.meetingDate ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.meetingDate && (
                <p className="mt-1 text-xs md:text-sm text-red-600">{errors.meetingDate.message}</p>
              )}
            </div>

            <Controller
              name="participants"
              control={control}
              render={({ field }) => (
                <PersonSelector
                  label="משתתפים בפגישה"
                  contacts={contacts}
                  selectedPersons={field.value}
                  onChange={field.onChange}
                  error={errors.participants?.message}
                  multiSelect={true}
                />
              )}
            />

            <Controller
              name="creativeWriter"
              control={control}
              render={({ field }) => (
                <PersonSelector
                  label="מי כותב קריאייטיב"
                  contacts={contacts}
                  selectedPersons={field.value}
                  onChange={field.onChange}
                  error={errors.creativeWriter?.message}
                  multiSelect={false}
                />
              )}
            />

            <Controller
              name="presenter"
              control={control}
              render={({ field }) => (
                <PersonSelector
                  label="מי מציג ללקוח (אחראי על המצגת)"
                  contacts={contacts}
                  selectedPersons={field.value}
                  onChange={field.onChange}
                  error={errors.presenter?.message}
                  multiSelect={false}
                />
              )}
            />

            <Controller
              name="presentationMaker"
              control={control}
              render={({ field }) => (
                <PersonSelector
                  label="מי מכין את המצגת"
                  contacts={contacts}
                  selectedPersons={field.value}
                  onChange={field.onChange}
                  error={errors.presentationMaker?.message}
                  multiSelect={false}
                />
              )}
            />

            <Controller
              name="accountManager"
              control={control}
              render={({ field }) => (
                <PersonSelector
                  label="מנהל לקוח"
                  contacts={contacts}
                  selectedPersons={field.value}
                  onChange={field.onChange}
                  error={errors.accountManager?.message}
                  multiSelect={false}
                />
              )}
            />

            <Controller
              name="mediaPerson"
              control={control}
              render={({ field }) => (
                <PersonSelector
                  label="איש מדיה"
                  contacts={contacts}
                  selectedPersons={field.value || []}
                  onChange={field.onChange}
                  error={errors.mediaPerson?.message}
                  multiSelect={false}
                />
              )}
            />
          </div>

          {/* על הבריף */}
          <div className="mb-8">
            <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">
              על הבריף / המוצר / השירות - מתוך הבריף
            </h2>

            <div className="mb-6">
              <label htmlFor="aboutBrand" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                על המותג
                <span className="text-red-500 mr-1">*</span>
              </label>
              <textarea
                id="aboutBrand"
                {...register('aboutBrand')}
                rows={4}
                className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                  errors.aboutBrand ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.aboutBrand && (
                <p className="mt-1 text-xs md:text-sm text-red-600">{errors.aboutBrand.message}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="targetAudiences" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                קהלי יעד
                <span className="text-red-500 mr-1">*</span>
              </label>
              <textarea
                id="targetAudiences"
                {...register('targetAudiences')}
                rows={4}
                className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                  errors.targetAudiences ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.targetAudiences && (
                <p className="mt-1 text-xs md:text-sm text-red-600">{errors.targetAudiences.message}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="goals" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                מטרות
                <span className="text-red-500 mr-1">*</span>
              </label>
              <textarea
                id="goals"
                {...register('goals')}
                rows={4}
                className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                  errors.goals ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.goals && (
                <p className="mt-1 text-xs md:text-sm text-red-600">{errors.goals.message}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="insight" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                תובנה
                <span className="text-red-500 mr-1">*</span>
              </label>
              <textarea
                id="insight"
                {...register('insight')}
                rows={4}
                className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                  errors.insight ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.insight && (
                <p className="mt-1 text-xs md:text-sm text-red-600">{errors.insight.message}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="strategy" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                אסטרטגיה
                <span className="text-red-500 mr-1">*</span>
              </label>
              <textarea
                id="strategy"
                {...register('strategy')}
                rows={4}
                className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                  errors.strategy ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.strategy && (
                <p className="mt-1 text-xs md:text-sm text-red-600">{errors.strategy.message}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="mediaStrategy" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                אסטרטגיית מדיה
              </label>
              <textarea
                id="mediaStrategy"
                {...register('mediaStrategy')}
                rows={4}
                className="w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="creative" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                קריאייטיב
                <span className="text-red-500 mr-1">*</span>
              </label>
              <textarea
                id="creative"
                {...register('creative')}
                rows={4}
                className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                  errors.creative ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.creative && (
                <p className="mt-1 text-xs md:text-sm text-red-600">{errors.creative.message}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="creativePresentation" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                הצגת קריאייטיב
              </label>
              <textarea
                id="creativePresentation"
                {...register('creativePresentation')}
                rows={3}
                className="w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="influencersExample" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                משפיענים לדוגמא
              </label>
              <textarea
                id="influencersExample"
                {...register('influencersExample')}
                rows={3}
                className="w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="additionalNotes" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                הערות נוספות
              </label>
              <textarea
                id="additionalNotes"
                {...register('additionalNotes')}
                rows={3}
                className="w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="budgetDistribution" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                חלוקת תקציב
              </label>
              <textarea
                id="budgetDistribution"
                {...register('budgetDistribution')}
                rows={3}
                className="w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* דדליינים */}
          <div className="mb-8">
            <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">
              דדליינים
            </h2>

            <div className="mb-6">
              <label htmlFor="creativeDeadline" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                דד ליין קריאייטיב
                <span className="text-red-500 mr-1">*</span>
              </label>
              <input
                id="creativeDeadline"
                type="date"
                {...register('creativeDeadline')}
                className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                  errors.creativeDeadline ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.creativeDeadline && (
                <p className="mt-1 text-xs md:text-sm text-red-600">{errors.creativeDeadline.message}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="internalDeadline" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                דד ליין פנימי
                <span className="text-red-500 mr-1">*</span>
              </label>
              <input
                id="internalDeadline"
                type="date"
                {...register('internalDeadline')}
                className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                  errors.internalDeadline ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.internalDeadline && (
                <p className="mt-1 text-xs md:text-sm text-red-600">{errors.internalDeadline.message}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="clientDeadline" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                דד ליין לקוח
                <span className="text-red-500 mr-1">*</span>
              </label>
              <input
                id="clientDeadline"
                type="date"
                {...register('clientDeadline')}
                className={`w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
                  errors.clientDeadline ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.clientDeadline && (
                <p className="mt-1 text-xs md:text-sm text-red-600">{errors.clientDeadline.message}</p>
              )}
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex flex-col md:flex-row justify-center gap-4 pt-6">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSaving}
              className="px-8 py-3 md:px-12 md:py-4 bg-gray-600 text-white font-bold text-base md:text-lg rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'שומר...' : 'שמור להמשך'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isSaving}
              className="px-8 py-3 md:px-12 md:py-4 bg-primary text-white font-bold text-base md:text-lg rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'שולח...' : 'שלח טופס'}
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 md:p-8 max-w-md w-full">
            <h3 className="text-xl md:text-2xl font-bold text-gray-800 mb-4">
              האם אתה בטוח?
            </h3>
            <p className="text-gray-600 mb-6">
              הטופס יישלח ללקוח ויועבר למצב הושלם. פעולה זו לא ניתנת לביטול.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 px-6 py-3 bg-gray-300 text-gray-800 font-bold rounded-lg hover:bg-gray-400 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={confirmSubmit}
                className="flex-1 px-6 py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors"
              >
                אשר ושלח
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft Name Dialog */}
      {showDraftNameDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 md:p-8 max-w-md w-full">
            <h3 className="text-xl md:text-2xl font-bold text-gray-800 mb-4">
              שמירת טיוטה חדשה
            </h3>
            <p className="text-gray-600 mb-4">
              נא להזין שם לטיוטה
            </p>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="לדוגמה: קמפיין קיץ 2025"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent mb-6"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draftName.trim()) {
                  handleCreateDraft()
                }
              }}
              autoFocus
            />
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowDraftNameDialog(false)
                  setDraftName('')
                }}
                className="flex-1 px-6 py-3 bg-gray-300 text-gray-800 font-bold rounded-lg hover:bg-gray-400 transition-colors"
                disabled={isSaving}
              >
                ביטול
              </button>
              <button
                onClick={handleCreateDraft}
                disabled={isSaving || !draftName.trim()}
                className="flex-1 px-6 py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

