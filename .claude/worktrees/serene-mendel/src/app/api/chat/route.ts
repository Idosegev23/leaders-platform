import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendChatMessage, parseJsonFromResponse, type ChatMessage } from '@/lib/openai/chat'

export const maxDuration = 600
import { generateId } from '@/lib/utils'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    const body = await request.json()
    const { action, documentType, conversationId, message } = body

    if (action === 'start') {
      console.log('[Chat API] Starting new conversation, type:', documentType)
      
      // Start new conversation
      const initialPrompt = documentType === 'quote'
        ? 'בוא נתחיל ליצור את הצעת המחיר. מה שם הלקוח שאליו מופנית ההצעה?'
        : 'בוא נתחיל ליצור את המצגת. מה נושא המצגת או הכותרת הראשית?'

      const newConversationId = generateId()
      console.log('[Chat API] Generated conversation ID:', newConversationId)

      // Save conversation to database
      const { error: insertError } = await supabase.from('conversations').insert({
        id: newConversationId,
        user_id: isDevMode ? null : userId,
        document_type: documentType,
        messages: [
          { role: 'assistant', content: initialPrompt, timestamp: new Date().toISOString() }
        ],
      })

      if (insertError) {
        console.error('[Chat API] Failed to save conversation:', insertError)
      } else {
        console.log('[Chat API] Conversation saved successfully')
      }

      return NextResponse.json({
        conversationId: newConversationId,
        message: initialPrompt,
      })
    }

    if (action === 'message') {
      console.log('[Chat API] Looking for conversation:', conversationId)
      
      // Get existing conversation from database
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('messages, document_type, openai_response_id')
        .eq('id', conversationId)
        .single()

      if (convError) {
        console.error('[Chat API] Supabase error:', convError)
      }
      
      if (!conversation) {
        console.error('[Chat API] Conversation not found:', conversationId)
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }
      
      console.log('[Chat API] Found conversation with', (conversation.messages as unknown[])?.length || 0, 'messages')

      const existingMessages = (conversation.messages as Array<{ role: string; content: string; timestamp: string }>) || []
      const docType = (conversation.document_type || documentType) as 'quote' | 'deck'

      // Build message history for OpenAI
      const chatHistory: ChatMessage[] = existingMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      // Add new user message
      chatHistory.push({ role: 'user', content: message })

      console.log('[Chat API] Sending to OpenAI...')
      
      // Send to OpenAI
      const result = await sendChatMessage(
        chatHistory,
        docType,
        conversation.openai_response_id || undefined
      )

      console.log('[Chat API] OpenAI response received')

      const responseText = result.text

      // Check if response contains ready JSON
      const parsedData = parseJsonFromResponse(responseText)

      // Update conversation in database
      const updatedMessages = [
        ...existingMessages,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: responseText, timestamp: new Date().toISOString() },
      ]

      await supabase
        .from('conversations')
        .update({
          messages: updatedMessages,
          openai_response_id: result.responseId,
        })
        .eq('id', conversationId)

      return NextResponse.json({
        message: responseText,
        ready: parsedData?.ready || false,
        data: parsedData?.data || null,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
