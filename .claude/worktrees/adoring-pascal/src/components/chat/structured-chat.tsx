'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { 
  QuoteField, 
  QUOTE_GROUPS, 
  getNextField, 
  calculateProgress,
  getFieldsByGroup,
  InfluencerData
} from '@/lib/schemas/quote-schema'

interface Message {
  id: string
  type: 'bot' | 'user' | 'section'
  content: string
  field?: QuoteField
}

interface StructuredChatProps {
  documentType: 'quote' | 'deck'
  onComplete: (data: Record<string, unknown>) => void
}

export function StructuredChat({ documentType, onComplete }: StructuredChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [currentField, setCurrentField] = useState<QuoteField | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [arrayItems, setArrayItems] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  
  // Influencer input states
  const [influencerList, setInfluencerList] = useState<InfluencerData[]>([])
  const [currentInfluencer, setCurrentInfluencer] = useState<Partial<InfluencerData>>({})
  const [influencerStep, setInfluencerStep] = useState<'name' | 'image' | 'followers' | 'engagement' | 'done'>('name')

  const progress = calculateProgress(answers)

  const askNextQuestion = useCallback((currentAnswers: Record<string, unknown>) => {
    const nextField = getNextField(currentAnswers)
    
    if (!nextField) {
      setIsComplete(true)
      setIsTyping(true)
      setTimeout(() => {
        setMessages(prev => {
          if (prev.some(m => m.id === 'complete')) return prev
          return [...prev, {
            id: 'complete',
            type: 'bot',
            content: 'מעולה, יש לי את כל המידע.',
          }]
        })
        setIsTyping(false)
      }, 500)
      return
    }

    setCurrentField(nextField)
    
    const group = QUOTE_GROUPS.find(g => g.id === nextField.group)
    const fieldsInGroup = getFieldsByGroup(nextField.group)
    const isFirstInGroup = fieldsInGroup[0].id === nextField.id
    
    setIsTyping(true)
    
    // Add section header if first in group
    if (isFirstInGroup) {
      setTimeout(() => {
        setMessages(prev => {
          const sectionId = `section-${nextField.group}`
          if (prev.some(m => m.id === sectionId)) return prev
          return [...prev, {
            id: sectionId,
            type: 'section',
            content: group?.name || nextField.group,
          }]
        })
      }, 200)
    }

    // Add question
    setTimeout(() => {
      setMessages(prev => {
        const questionId = `q-${nextField.id}`
        if (prev.some(m => m.id === questionId)) return prev
        return [...prev, {
          id: questionId,
          type: 'bot',
          content: nextField.question,
          field: nextField,
        }]
      })
      setIsTyping(false)
    }, isFirstInGroup ? 500 : 300)
    
    setInputValue(nextField.default?.toString() || '')
    setSelectedOptions([])
    setArrayItems([])
  }, [])

  // Initialize only once
  useEffect(() => {
    if (initialized) return
    setInitialized(true)
    
    const welcomeText = documentType === 'quote' 
      ? 'בוא ניצור הצעת מחיר. אלווה אותך שלב אחרי שלב.'
      : 'בוא ניצור מצגת. אלווה אותך שלב אחרי שלב.'
    
    setMessages([{
      id: 'welcome',
      type: 'bot',
      content: welcomeText,
    }])
    
    setTimeout(() => askNextQuestion({}), 1000)
  }, [initialized, documentType, askNextQuestion])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Focus input
  useEffect(() => {
    if (currentField && !isTyping) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [currentField, isTyping])

  function submitAnswer(value: unknown) {
    if (!currentField) return

    const displayValue = Array.isArray(value) 
      ? value.join(', ') 
      : value?.toString() || '(דילוג)'
    
    const answerId = `a-${currentField.id}`
    setMessages(prev => {
      if (prev.some(m => m.id === answerId)) return prev
      return [...prev, {
        id: answerId,
        type: 'user',
        content: displayValue,
      }]
    })

    const newAnswers = { ...answers, [currentField.id]: value }
    setAnswers(newAnswers)
    setInputValue('')
    setSelectedOptions([])
    setArrayItems([])
    setSelectedFile(null)

    setTimeout(() => askNextQuestion(newAnswers), 400)
  }

  function handleSubmit() {
    if (!currentField) return

    let value: unknown
    
    switch (currentField.type) {
      case 'multi_select':
        if (selectedOptions.length === 0 && currentField.required) return
        value = selectedOptions
        break
      case 'array':
        if (arrayItems.length === 0 && currentField.required) return
        value = arrayItems
        break
      case 'number':
        if (!inputValue && currentField.required) return
        value = inputValue ? Number(inputValue) : undefined
        break
      case 'enum':
        if (!inputValue && currentField.required) return
        value = inputValue
        break
      default:
        if (!inputValue && currentField.required) return
        value = inputValue || undefined
    }

    submitAnswer(value)
  }

  function handleSkip() {
    if (!currentField) return
    
    const skipId = `a-${currentField.id}`
    setMessages(prev => {
      if (prev.some(m => m.id === skipId)) return prev
      return [...prev, {
        id: skipId,
        type: 'user',
        content: 'דילוג',
      }]
    })

    const newAnswers = { ...answers, [currentField.id]: '__skipped__' }
    setAnswers(newAnswers)
    setInputValue('')
    setSelectedOptions([])
    setArrayItems([])
    setSelectedFile(null)

    setTimeout(() => askNextQuestion(newAnswers), 400)
  }

  async function handleFileSubmit() {
    if (!currentField) return
    
    setIsUploading(true)
    
    try {
      let fileUrl = inputValue
      
      if (selectedFile) {
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('fieldId', currentField.id)
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        
        if (!response.ok) {
          throw new Error('Upload failed')
        }
        
        const data = await response.json()
        fileUrl = data.url
      }
      
      submitAnswer(fileUrl)
    } catch (error) {
      console.error('File upload error:', error)
      submitAnswer(inputValue || selectedFile?.name || '')
    } finally {
      setIsUploading(false)
      setSelectedFile(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function toggleOption(option: string) {
    setSelectedOptions(prev => 
      prev.includes(option) 
        ? prev.filter(o => o !== option)
        : [...prev, option]
    )
  }

  function addArrayItem() {
    if (inputValue.trim()) {
      setArrayItems(prev => [...prev, inputValue.trim()])
      setInputValue('')
    }
  }

  function removeArrayItem(index: number) {
    setArrayItems(prev => prev.filter((_, i) => i !== index))
  }

  function renderInput() {
    if (!currentField || isTyping) return null

    switch (currentField.type) {
      case 'enum':
        return (
          <div className="flex flex-wrap gap-3">
            {currentField.options?.map(option => (
              <button
                key={option}
                onClick={() => submitAnswer(option)}
                className="px-5 py-2.5 rounded-lg bg-white border border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-all text-gray-700 font-medium"
              >
                {option}
              </button>
            ))}
          </div>
        )

      case 'multi_select':
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {currentField.options?.map(option => (
                <button
                  key={option}
                  onClick={() => toggleOption(option)}
                  className={`px-4 py-2 rounded-lg transition-all font-medium ${
                    selectedOptions.includes(option)
                      ? 'bg-gray-900 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            {selectedOptions.length > 0 && (
              <Button onClick={handleSubmit} className="bg-gray-900 hover:bg-gray-800">
                המשך
              </Button>
            )}
          </div>
        )

      case 'array':
        return (
          <div className="space-y-3">
            {arrayItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {arrayItems.map((item, i) => (
                  <Badge key={i} variant="secondary" className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700">
                    {item}
                    <button 
                      onClick={() => removeArrayItem(i)}
                      className="mr-2 hover:text-red-500"
                    >
                      x
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addArrayItem()
                  }
                }}
                placeholder={currentField.placeholder || 'הוסף פריט...'}
                className="flex-1 bg-white border border-gray-200 focus:border-gray-400 rounded-lg placeholder:text-gray-400"
                dir="rtl"
              />
              <Button onClick={addArrayItem} variant="outline" className="rounded-lg">
                הוסף
              </Button>
            </div>
            {arrayItems.length > 0 && (
              <Button onClick={handleSubmit} className="bg-gray-900 hover:bg-gray-800">
                המשך
              </Button>
            )}
          </div>
        )

      case 'textarea':
        return (
          <div className="space-y-3">
            <Textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder={currentField.placeholder}
              maxLength={currentField.maxLength}
              rows={4}
              className="w-full bg-white border border-gray-200 focus:border-gray-400 rounded-lg resize-none placeholder:text-gray-400"
              dir="rtl"
            />
            <div className="flex justify-between items-center">
              {currentField.maxLength && (
                <span className="text-xs text-gray-400">
                  {inputValue.length}/{currentField.maxLength}
                </span>
              )}
              <Button onClick={handleSubmit} className="bg-gray-900 hover:bg-gray-800">
                המשך
              </Button>
            </div>
          </div>
        )

      case 'number':
        return (
          <div className="flex gap-3">
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="number"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              min={currentField.min}
              max={currentField.max}
              placeholder={currentField.placeholder || 'הזן מספר...'}
              className="flex-1 bg-white border border-gray-200 focus:border-gray-400 rounded-lg text-lg placeholder:text-gray-400"
              dir="ltr"
            />
            <Button onClick={handleSubmit} className="bg-gray-900 hover:bg-gray-800 rounded-lg px-6">
              המשך
            </Button>
          </div>
        )

      case 'date':
        return (
          <div className="flex gap-3">
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="date"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-white border border-gray-200 focus:border-gray-400 rounded-lg"
              dir="ltr"
            />
            <Button onClick={handleSubmit} className="bg-gray-900 hover:bg-gray-800 rounded-lg px-6">
              המשך
            </Button>
          </div>
        )

      case 'file':
      case 'file_or_url':
        return (
          <div className="space-y-3">
            <div 
              className="border border-dashed border-gray-300 rounded-lg p-6 text-center bg-white hover:border-gray-400 transition-colors cursor-pointer relative"
              onClick={() => document.getElementById(`file-upload-${currentField.id}`)?.click()}
            >
              <input
                type="file"
                accept={currentField.accept?.join(',')}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setInputValue(file.name)
                    setSelectedFile(file)
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                id={`file-upload-${currentField.id}`}
              />
              {inputValue ? (
                <div>
                  <div className="text-green-600 font-medium">{inputValue}</div>
                  <div className="text-xs text-gray-400 mt-1">לחץ להחלפה</div>
                </div>
              ) : (
                <div>
                  <div className="text-gray-600">לחץ להעלאת קובץ</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {currentField.accept?.join(', ')}
                  </div>
                </div>
              )}
            </div>
            {currentField.type === 'file_or_url' && (
              <>
                <div className="text-center text-gray-400 text-sm">או הדבק קישור</div>
                <Input
                  value={inputValue}
                  onChange={e => {
                    setInputValue(e.target.value)
                    setSelectedFile(null)
                  }}
                  placeholder="https://..."
                  className="bg-white border border-gray-200 focus:border-gray-400 rounded-lg placeholder:text-gray-400"
                  dir="ltr"
                />
              </>
            )}
            {(inputValue || selectedFile) && (
              <Button onClick={handleFileSubmit} className="w-full bg-gray-900 hover:bg-gray-800">
                {isUploading ? 'מעלה...' : 'המשך'}
              </Button>
            )}
          </div>
        )

      case 'influencer_list':
        const targetCount = (answers.influencerCount as number) || 3
        const currentIndex = influencerList.length + 1
        
        return (
          <div className="space-y-4">
            {/* Progress indicator */}
            <div className="text-sm text-gray-500 mb-2">
              משפיען {currentIndex} מתוך {targetCount}
            </div>
            
            {/* Show already added influencers */}
            {influencerList.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {influencerList.map((inf, i) => (
                  <Badge key={i} variant="secondary" className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700">
                    {inf.name} ({(inf.followers / 1000).toFixed(0)}K)
                    <button 
                      onClick={() => setInfluencerList(prev => prev.filter((_, idx) => idx !== i))}
                      className="mr-2 hover:text-red-500"
                    >
                      x
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            
            {/* Current influencer form */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              {influencerStep === 'name' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">שם המשפיען</label>
                  <div className="flex gap-2">
                    <Input
                      value={currentInfluencer.name || ''}
                      onChange={e => setCurrentInfluencer(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="@username או שם מלא"
                      className="flex-1 bg-white border-gray-200 placeholder:text-gray-400"
                      dir="ltr"
                    />
                    <Button 
                      onClick={() => currentInfluencer.name && setInfluencerStep('image')}
                      disabled={!currentInfluencer.name}
                      className="bg-gray-900 hover:bg-gray-800"
                    >
                      הבא
                    </Button>
                  </div>
                </div>
              )}
              
              {influencerStep === 'image' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">תמונת המשפיען (קישור)</label>
                  <div className="flex gap-2">
                    <Input
                      value={currentInfluencer.imageUrl || ''}
                      onChange={e => setCurrentInfluencer(prev => ({ ...prev, imageUrl: e.target.value }))}
                      placeholder="https://... (אופציונלי)"
                      className="flex-1 bg-white border-gray-200 placeholder:text-gray-400"
                      dir="ltr"
                    />
                    <Button 
                      onClick={() => setInfluencerStep('followers')}
                      className="bg-gray-900 hover:bg-gray-800"
                    >
                      הבא
                    </Button>
                  </div>
                </div>
              )}
              
              {influencerStep === 'followers' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">כמות עוקבים</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={currentInfluencer.followers || ''}
                      onChange={e => setCurrentInfluencer(prev => ({ ...prev, followers: parseInt(e.target.value) || 0 }))}
                      placeholder="50000"
                      className="flex-1 bg-white border-gray-200 placeholder:text-gray-400"
                      dir="ltr"
                    />
                    <Button 
                      onClick={() => currentInfluencer.followers && setInfluencerStep('engagement')}
                      disabled={!currentInfluencer.followers}
                      className="bg-gray-900 hover:bg-gray-800"
                    >
                      הבא
                    </Button>
                  </div>
                </div>
              )}
              
              {influencerStep === 'engagement' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">ממוצע לייקים</label>
                      <Input
                        type="number"
                        value={currentInfluencer.avgLikes || ''}
                        onChange={e => setCurrentInfluencer(prev => ({ ...prev, avgLikes: parseInt(e.target.value) || 0 }))}
                        placeholder="2500"
                        className="bg-white border-gray-200 placeholder:text-gray-400"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">ממוצע תגובות</label>
                      <Input
                        type="number"
                        value={currentInfluencer.avgComments || ''}
                        onChange={e => setCurrentInfluencer(prev => ({ ...prev, avgComments: parseInt(e.target.value) || 0 }))}
                        placeholder="150"
                        className="bg-white border-gray-200 placeholder:text-gray-400"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">אחוז מעורבות (Engagement Rate)</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={currentInfluencer.engagementRate || ''}
                      onChange={e => setCurrentInfluencer(prev => ({ ...prev, engagementRate: parseFloat(e.target.value) || 0 }))}
                      placeholder="4.5"
                      className="bg-white border-gray-200 placeholder:text-gray-400"
                      dir="ltr"
                    />
                  </div>
                  <Button 
                    onClick={() => {
                      // Add current influencer to list
                      const newInfluencer: InfluencerData = {
                        name: currentInfluencer.name || '',
                        imageUrl: currentInfluencer.imageUrl,
                        followers: currentInfluencer.followers || 0,
                        avgLikes: currentInfluencer.avgLikes,
                        avgComments: currentInfluencer.avgComments,
                        engagementRate: currentInfluencer.engagementRate,
                      }
                      const newList = [...influencerList, newInfluencer]
                      setInfluencerList(newList)
                      setCurrentInfluencer({})
                      setInfluencerStep('name')
                      
                      // Check if done
                      if (newList.length >= targetCount) {
                        submitAnswer(newList)
                        setInfluencerList([])
                      }
                    }}
                    className="w-full bg-gray-900 hover:bg-gray-800"
                  >
                    {influencerList.length + 1 >= targetCount ? 'סיום' : 'הוסף משפיען והמשך לבא'}
                  </Button>
                </div>
              )}
            </div>
            
            {/* Option to finish early */}
            {influencerList.length > 0 && influencerStep === 'name' && (
              <Button 
                variant="outline"
                onClick={() => {
                  submitAnswer(influencerList)
                  setInfluencerList([])
                }}
                className="w-full"
              >
                סיים עם {influencerList.length} משפיענים
              </Button>
            )}
          </div>
        )

      default:
        return (
          <div className="flex gap-3">
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentField.placeholder || 'הקלד כאן...'}
              className="flex-1 bg-white border border-gray-200 focus:border-gray-400 rounded-lg text-lg py-3 placeholder:text-gray-400"
              dir={currentField.type === 'url' ? 'ltr' : 'rtl'}
            />
            <Button onClick={handleSubmit} className="bg-gray-900 hover:bg-gray-800 rounded-lg px-6">
              המשך
            </Button>
          </div>
        )
    }
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      {/* Progress Header */}
      <div className="bg-white px-6 py-5 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-gray-900">
              {documentType === 'quote' ? 'הצעת מחיר' : 'מצגת'}
            </h2>
            <p className="text-sm text-gray-500">
              {progress.percentage}% הושלם
            </p>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {progress.percentage}%
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gray-900 transition-all duration-700 ease-out"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        
        {/* Section pills */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
          {QUOTE_GROUPS.map((group) => {
            const isActive = group.id === progress.currentGroup
            const groupIndex = QUOTE_GROUPS.findIndex(g => g.id === group.id)
            const currentIndex = QUOTE_GROUPS.findIndex(g => g.id === progress.currentGroup)
            const isPast = groupIndex < currentIndex
            
            return (
              <div 
                key={group.id}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isActive 
                    ? 'bg-gray-900 text-white' 
                    : isPast 
                      ? 'bg-gray-200 text-gray-600' 
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {group.name}
              </div>
            )
          })}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.type === 'user' ? 'justify-start' : 'justify-end'} animate-fadeIn`}
          >
            {msg.type === 'section' ? (
              <div className="w-full text-center my-4">
                <span className="inline-block px-4 py-2 bg-gray-50 rounded-full text-sm font-medium text-gray-600 border border-gray-100">
                  {msg.content}
                </span>
              </div>
            ) : (
              <div
                className={`max-w-[85%] px-5 py-3.5 rounded-2xl ${
                  msg.type === 'user'
                    ? 'bg-gray-900 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-900 rounded-bl-md border border-gray-200'
                }`}
              >
                <p className="text-[15px] leading-relaxed">{msg.content}</p>
                {msg.field && !msg.field.required && (
                  <span className="text-xs opacity-60 mt-1 block">לא חובה</span>
                )}
              </div>
            )}
          </div>
        ))}
        
        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-end">
            <div className="bg-gray-100 px-5 py-3 rounded-2xl rounded-bl-md border border-gray-200">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {!isComplete && currentField && !isTyping && (
        <div className="border-t border-gray-100 bg-white p-5">
          {renderInput()}
          {!currentField.required && currentField.type !== 'enum' && (
            <button
              onClick={handleSkip}
              className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              דלג
            </button>
          )}
        </div>
      )}

      {/* Complete state */}
      {isComplete && (
        <div className="border-t border-gray-100 bg-gray-50 p-6">
          <Button
            onClick={() => onComplete(answers)}
            className="w-full py-6 text-lg font-semibold bg-gray-900 hover:bg-gray-800 rounded-xl"
          >
            צור את המסמך
          </Button>
        </div>
      )}
    </div>
  )
}
