export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'user'
export type DocumentType = 'quote' | 'deck'
export type DocumentStatus = 'draft' | 'preview' | 'generated' | 'archived'
export type TemplateStyle = 'minimal' | 'bold' | 'premium'
export type SlideType = 'title' | 'context' | 'audience' | 'big_idea' | 'image_focus' | 'moodboard' | 'comparison' | 'summary'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          avatar_url: string | null
          role: UserRole
          google_drive_folder_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          avatar_url?: string | null
          role?: UserRole
          google_drive_folder_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          avatar_url?: string | null
          role?: UserRole
          google_drive_folder_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      templates: {
        Row: {
          id: string
          name: string
          type: DocumentType
          style: TemplateStyle
          colors: Json
          fonts: Json
          logo_url: string | null
          header_config: Json
          footer_config: Json
          is_default: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type: DocumentType
          style?: TemplateStyle
          colors?: Json
          fonts?: Json
          logo_url?: string | null
          header_config?: Json
          footer_config?: Json
          is_default?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: DocumentType
          style?: TemplateStyle
          colors?: Json
          fonts?: Json
          logo_url?: string | null
          header_config?: Json
          footer_config?: Json
          is_default?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          user_id: string
          template_id: string | null
          type: DocumentType
          title: string
          data: Json
          status: DocumentStatus
          pdf_url: string | null
          drive_file_id: string | null
          drive_file_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          template_id?: string | null
          type: DocumentType
          title: string
          data?: Json
          status?: DocumentStatus
          pdf_url?: string | null
          drive_file_id?: string | null
          drive_file_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          template_id?: string | null
          type?: DocumentType
          title?: string
          data?: Json
          status?: DocumentStatus
          pdf_url?: string | null
          drive_file_id?: string | null
          drive_file_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          document_id: string | null
          messages: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_id?: string | null
          messages?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_id?: string | null
          messages?: Json
          created_at?: string
          updated_at?: string
        }
      }
      generated_images: {
        Row: {
          id: string
          document_id: string | null
          prompt: string
          image_url: string
          source: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          document_id?: string | null
          prompt: string
          image_url: string
          source?: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string | null
          prompt?: string
          image_url?: string
          source?: string
          metadata?: Json
          created_at?: string
        }
      }
    }
    Enums: {
      user_role: UserRole
      document_type: DocumentType
      document_status: DocumentStatus
      template_style: TemplateStyle
      slide_type: SlideType
    }
  }
}

// Helper types
export type User = Database['public']['Tables']['users']['Row']
export type Template = Database['public']['Tables']['templates']['Row']
export type Document = Database['public']['Tables']['documents']['Row']
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type GeneratedImage = Database['public']['Tables']['generated_images']['Row']





