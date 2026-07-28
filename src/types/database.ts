/**
 * Types สร้างจาก Supabase schema
 * อัปเดตใหม่ด้วย: npx supabase gen types typescript --project-id jrioyrmicioqammeevgh
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allowed_users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          role?: string
        }
        Relationships: []
      }
      assistant_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: number
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: never
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: never
          role?: string
        }
        Relationships: []
      }
      assistant_memories: {
        Row: {
          content: string
          created_at: string
          id: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: never
        }
        Update: {
          content?: string
          created_at?: string
          id?: never
        }
        Relationships: []
      }
      assistant_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          checked_in_at: string
          checked_out_at: string | null
          created_by: string | null
          id: string
          staff_id: string | null
          therapist_id: string | null
          work_date: string
        }
        Insert: {
          checked_in_at?: string
          checked_out_at?: string | null
          created_by?: string | null
          id?: string
          staff_id?: string | null
          therapist_id?: string | null
          work_date: string
        }
        Update: {
          checked_in_at?: string
          checked_out_at?: string | null
          created_by?: string | null
          id?: string
          staff_id?: string | null
          therapist_id?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_expenses_costtype_20260720: {
        Row: {
          category: string | null
          cost_type: string | null
          id: string | null
          item: string | null
        }
        Insert: {
          category?: string | null
          cost_type?: string | null
          id?: string | null
          item?: string | null
        }
        Update: {
          category?: string | null
          cost_type?: string | null
          id?: string | null
          item?: string | null
        }
        Relationships: []
      }
      backup_sales_time_20260720: {
        Row: {
          id: string | null
          receipt_no: string | null
          sale_time: string | null
        }
        Insert: {
          id?: string | null
          receipt_no?: string | null
          sale_time?: string | null
        }
        Update: {
          id?: string | null
          receipt_no?: string | null
          sale_time?: string | null
        }
        Relationships: []
      }
      backup_services_cost_20260720: {
        Row: {
          id: string | null
          material_cost: number | null
          name: string | null
        }
        Insert: {
          id?: string | null
          material_cost?: number | null
          name?: string | null
        }
        Update: {
          id?: string | null
          material_cost?: number | null
          name?: string | null
        }
        Relationships: []
      }
      beds: {
        Row: {
          id: string
          is_active: boolean
          name: string
          room: string
          sort: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          room: string
          sort: number
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          room?: string
          sort?: number
        }
        Relationships: []
      }
      crm_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          list_type: string
          note: string | null
          result: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          list_type: string
          note?: string | null
          result: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          list_type?: string
          note?: string | null
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "crm_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_issues"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "crm_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_ltv"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      customers: {
        Row: {
          acquisition_source: string | null
          birthday: string | null
          created_at: string
          customer_type: string
          gender: string | null
          id: string
          legacy_ref: string | null
          line_id: string | null
          name: string
          nationality: string | null
          nickname: string | null
          notes: string | null
          phone: string | null
          tags: string | null
          updated_at: string
        }
        Insert: {
          acquisition_source?: string | null
          birthday?: string | null
          created_at?: string
          customer_type?: string
          gender?: string | null
          id?: string
          legacy_ref?: string | null
          line_id?: string | null
          name: string
          nationality?: string | null
          nickname?: string | null
          notes?: string | null
          phone?: string | null
          tags?: string | null
          updated_at?: string
        }
        Update: {
          acquisition_source?: string | null
          birthday?: string | null
          created_at?: string
          customer_type?: string
          gender?: string | null
          id?: string
          legacy_ref?: string | null
          line_id?: string | null
          name?: string
          nationality?: string | null
          nickname?: string | null
          notes?: string | null
          phone?: string | null
          tags?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expense_category_types: {
        Row: {
          category: string
          cost_type: string
        }
        Insert: {
          category: string
          cost_type: string
        }
        Update: {
          category?: string
          cost_type?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          cost_type: string
          created_at: string
          expense_date: string
          id: string
          item: string
          notes: string | null
          paid_by: string | null
        }
        Insert: {
          amount: number
          category: string
          cost_type?: string
          created_at?: string
          expense_date: string
          id?: string
          item: string
          notes?: string | null
          paid_by?: string | null
        }
        Update: {
          amount?: number
          category?: string
          cost_type?: string
          created_at?: string
          expense_date?: string
          id?: string
          item?: string
          notes?: string | null
          paid_by?: string | null
        }
        Relationships: []
      }
      line_accounts: {
        Row: {
          created_at: string
          customer_id: string
          display_name: string | null
          line_user_id: string
          phone: string | null
          picture_url: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          display_name?: string | null
          line_user_id: string
          phone?: string | null
          picture_url?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          display_name?: string | null
          line_user_id?: string
          phone?: string | null
          picture_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "line_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "line_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_issues"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "line_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_ltv"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      line_groups: {
        Row: {
          group_id: string
          last_seen_at: string
          note: string | null
        }
        Insert: {
          group_id: string
          last_seen_at?: string
          note?: string | null
        }
        Update: {
          group_id?: string
          last_seen_at?: string
          note?: string | null
        }
        Relationships: []
      }
      member_topups: {
        Row: {
          bonus_added: number
          cash_received: number
          created_at: string
          credit_added: number
          customer_id: string
          expiry_date: string
          id: string
          notes: string | null
          payment_method: string
          tier: string
          topup_date: string
        }
        Insert: {
          bonus_added: number
          cash_received: number
          created_at?: string
          credit_added: number
          customer_id: string
          expiry_date: string
          id?: string
          notes?: string | null
          payment_method: string
          tier: string
          topup_date: string
        }
        Update: {
          bonus_added?: number
          cash_received?: number
          created_at?: string
          credit_added?: number
          customer_id?: string
          expiry_date?: string
          id?: string
          notes?: string | null
          payment_method?: string
          tier?: string
          topup_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_topups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_topups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "member_topups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_issues"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "member_topups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_ltv"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      point_redemptions: {
        Row: {
          code: string
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          points_cost: number
          reward_id: string
          reward_name: string
          status: string
          used_at: string | null
          used_by: string | null
          used_sale_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          points_cost: number
          reward_id: string
          reward_name: string
          status?: string
          used_at?: string | null
          used_by?: string | null
          used_sale_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          points_cost?: number
          reward_id?: string
          reward_name?: string
          status?: string
          used_at?: string | null
          used_by?: string | null
          used_sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "point_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "point_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_issues"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "point_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_ltv"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "point_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "point_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_redemptions_used_sale_id_fkey"
            columns: ["used_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      point_rewards: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          points_cost: number
          service_id: string | null
          sort: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          points_cost: number
          service_id?: string | null
          sort?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          points_cost?: number
          service_id?: string | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "point_rewards_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          delta: number
          expires_at: string | null
          id: string
          reason: string
          redemption_id: string | null
          sale_id: string | null
          topup_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          delta: number
          expires_at?: string | null
          id?: string
          reason: string
          redemption_id?: string | null
          sale_id?: string | null
          topup_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delta?: number
          expires_at?: string | null
          id?: string
          reason?: string
          redemption_id?: string | null
          sale_id?: string | null
          topup_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "point_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_issues"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "point_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_ltv"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "point_transactions_redemption_id_fkey"
            columns: ["redemption_id"]
            isOneToOne: false
            referencedRelation: "point_redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_topup_id_fkey"
            columns: ["topup_id"]
            isOneToOne: false
            referencedRelation: "member_topups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      promotion_aliases: {
        Row: {
          promotion_id: string | null
          raw_key: string
          sample_text: string | null
          updated_at: string
        }
        Insert: {
          promotion_id?: string | null
          raw_key: string
          sample_text?: string | null
          updated_at?: string
        }
        Update: {
          promotion_id?: string | null
          raw_key?: string
          sample_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_aliases_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_aliases_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "v_promo_roi"
            referencedColumns: ["promotion_id"]
          },
        ]
      }
      promotions: {
        Row: {
          created_at: string
          discount_pct: number | null
          id: string
          is_active: boolean
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          discount_pct?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
        }
        Update: {
          created_at?: string
          discount_pct?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
        }
        Relationships: []
      }
      queue_entries: {
        Row: {
          bed_id: string | null
          booking_channel: string | null
          client_key: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          duration_min: number
          group_id: string | null
          id: string
          is_request: boolean
          line_user_id: string | null
          notes: string | null
          private_room: boolean
          queue_date: string
          reject_reason: string | null
          sale_id: string | null
          service_id: string | null
          service_name: string
          source: string
          start_time: string
          started_at: string | null
          status: string
          therapist_id: string | null
          updated_at: string
        }
        Insert: {
          bed_id?: string | null
          booking_channel?: string | null
          client_key?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          duration_min: number
          group_id?: string | null
          id?: string
          is_request?: boolean
          line_user_id?: string | null
          notes?: string | null
          private_room?: boolean
          queue_date: string
          reject_reason?: string | null
          sale_id?: string | null
          service_id?: string | null
          service_name: string
          source?: string
          start_time: string
          started_at?: string | null
          status?: string
          therapist_id?: string | null
          updated_at?: string
        }
        Update: {
          bed_id?: string | null
          booking_channel?: string | null
          client_key?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          duration_min?: number
          group_id?: string | null
          id?: string
          is_request?: boolean
          line_user_id?: string | null
          notes?: string | null
          private_room?: boolean
          queue_date?: string
          reject_reason?: string | null
          sale_id?: string | null
          service_id?: string | null
          service_name?: string
          source?: string
          start_time?: string
          started_at?: string | null
          status?: string
          therapist_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_entries_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "queue_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_issues"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "queue_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_ltv"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "queue_entries_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_counters: {
        Row: {
          counter_date: string
          last_number: number
        }
        Insert: {
          counter_date: string
          last_number?: number
        }
        Update: {
          counter_date?: string
          last_number?: number
        }
        Relationships: []
      }
      sales: {
        Row: {
          bed_id: string | null
          bill_id: string | null
          bonus_used: number
          booking_channel: string | null
          commission: number | null
          coupon_promo: string | null
          created_at: string
          created_by: string | null
          credit_after: number | null
          credit_used: number
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          edited_by: string | null
          group_id: string | null
          id: string
          is_request: boolean
          member_status: string | null
          net_amount: number
          notes: string | null
          payment_method: string
          price_normal: number
          receipt_no: string | null
          request_fee: number
          revenue_recognize: number | null
          room_fee: number
          sale_date: string
          sale_time: string | null
          service_id: string | null
          service_name: string | null
          source: string | null
          therapist_id: string | null
          updated_at: string
        }
        Insert: {
          bed_id?: string | null
          bill_id?: string | null
          bonus_used?: number
          booking_channel?: string | null
          commission?: number | null
          coupon_promo?: string | null
          created_at?: string
          created_by?: string | null
          credit_after?: number | null
          credit_used?: number
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          edited_by?: string | null
          group_id?: string | null
          id?: string
          is_request?: boolean
          member_status?: string | null
          net_amount: number
          notes?: string | null
          payment_method: string
          price_normal: number
          receipt_no?: string | null
          request_fee?: number
          revenue_recognize?: number | null
          room_fee?: number
          sale_date: string
          sale_time?: string | null
          service_id?: string | null
          service_name?: string | null
          source?: string | null
          therapist_id?: string | null
          updated_at?: string
        }
        Update: {
          bed_id?: string | null
          bill_id?: string | null
          bonus_used?: number
          booking_channel?: string | null
          commission?: number | null
          coupon_promo?: string | null
          created_at?: string
          created_by?: string | null
          credit_after?: number | null
          credit_used?: number
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          edited_by?: string | null
          group_id?: string | null
          id?: string
          is_request?: boolean
          member_status?: string | null
          net_amount?: number
          notes?: string | null
          payment_method?: string
          price_normal?: number
          receipt_no?: string | null
          request_fee?: number
          revenue_recognize?: number | null
          room_fee?: number
          sale_date?: string
          sale_time?: string | null
          service_id?: string | null
          service_name?: string | null
          source?: string | null
          therapist_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_issues"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_ltv"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          commission: number
          commission_old: number | null
          created_at: string
          duration_min: number | null
          id: string
          is_active: boolean
          material_cost: number | null
          name: string
          price: number
          price_old: number | null
        }
        Insert: {
          commission: number
          commission_old?: number | null
          created_at?: string
          duration_min?: number | null
          id?: string
          is_active?: boolean
          material_cost?: number | null
          name: string
          price: number
          price_old?: number | null
        }
        Update: {
          commission?: number
          commission_old?: number | null
          created_at?: string
          duration_min?: number | null
          id?: string
          is_active?: boolean
          material_cost?: number | null
          name?: string
          price?: number
          price_old?: number | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          value: string | null
        }
        Insert: {
          key: string
          value?: string | null
        }
        Update: {
          key?: string
          value?: string | null
        }
        Relationships: []
      }
      shift_plans: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          plan: string
          staff_id: string | null
          therapist_id: string | null
          work_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          plan: string
          staff_id?: string | null
          therapist_id?: string | null
          work_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          plan?: string
          staff_id?: string | null
          therapist_id?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_plans_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_plans_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          role: string
          sort: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          role: string
          sort?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          role?: string
          sort?: number
        }
        Relationships: []
      }
      therapist_daily_commission: {
        Row: {
          guarantee_amount: number
          id: string
          is_paid: boolean
          net_commission: number | null
          notes: string | null
          request_fee: number
          status: string | null
          therapist_id: string
          total_commission: number
          total_income: number | null
          work_date: string
        }
        Insert: {
          guarantee_amount?: number
          id?: string
          is_paid?: boolean
          net_commission?: number | null
          notes?: string | null
          request_fee?: number
          status?: string | null
          therapist_id: string
          total_commission?: number
          total_income?: number | null
          work_date: string
        }
        Update: {
          guarantee_amount?: number
          id?: string
          is_paid?: boolean
          net_commission?: number | null
          notes?: string | null
          request_fee?: number
          status?: string | null
          therapist_id?: string
          total_commission?: number
          total_income?: number | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_daily_commission_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapists: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      turn_aways: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          queue_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          queue_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          queue_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      member_balances: {
        Row: {
          bonus_granted: number | null
          cash_paid: number | null
          created_at: string | null
          credit_balance: number | null
          credit_granted: number | null
          customer_id: string | null
          customer_type: string | null
          name: string | null
          next_expiry: string | null
          nickname: string | null
          phone: string | null
        }
        Relationships: []
      }
      v_commission_daily: {
        Row: {
          commission: number | null
          work_date: string | null
        }
        Relationships: []
      }
      v_customer_issues: {
        Row: {
          bad_phone: boolean | null
          credit_balance: number | null
          customer_id: string | null
          customer_type: string | null
          dup_phone: boolean | null
          last_visit: string | null
          name: string | null
          negative_credit: boolean | null
          negative_points: boolean | null
          nickname: string | null
          no_phone: boolean | null
          phone: string | null
          visits: number | null
        }
        Relationships: []
      }
      v_customer_ltv: {
        Row: {
          avg_ticket: number | null
          customer_id: string | null
          customer_type: string | null
          first_visit: string | null
          last_visit: string | null
          lifetime_value: number | null
          name: string | null
          nickname: string | null
          phone: string | null
          visits: number | null
        }
        Relationships: []
      }
      v_daily_summary: {
        Row: {
          cash_in: number | null
          discount_total: number | null
          net_revenue: number | null
          sale_date: string | null
          sessions: number | null
          volume: number | null
        }
        Relationships: []
      }
      v_hourly_density: {
        Row: {
          hour: number | null
          revenue: number | null
          sessions: number | null
          weekday: number | null
        }
        Relationships: []
      }
      v_monthly_member_activity: {
        Row: {
          bonus_used: number | null
          credit_used: number | null
          month: string | null
          topup_in: number | null
          volume: number | null
        }
        Relationships: []
      }
      v_monthly_pl: {
        Row: {
          cash_in: number | null
          commission_cost: number | null
          expense_total: number | null
          fixed_cost: number | null
          guarantee_topup: number | null
          month: string | null
          net_revenue: number | null
          onetime_cost: number | null
          payroll_paid: number | null
          prev_net_revenue: number | null
          profit_accrual: number | null
          profit_cash: number | null
          sessions: number | null
          variable_cost: number | null
          ytd_net_revenue: number | null
          ytd_profit_cash: number | null
        }
        Relationships: []
      }
      v_point_balances: {
        Row: {
          balance: number | null
          customer_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "point_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_issues"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "point_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_ltv"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      v_promo_roi: {
        Row: {
          customers: number | null
          discount_given: number | null
          first_used: string | null
          kind: string | null
          last_used: string | null
          promotion_id: string | null
          promotion_name: string | null
          returning_customers: number | null
          revenue: number | null
          uses: number | null
        }
        Relationships: []
      }
      v_promo_unmatched: {
        Row: {
          raw_key: string | null
          sample_text: string | null
          uses: number | null
        }
        Relationships: []
      }
      v_therapist_daily: {
        Row: {
          guarantee_amount: number | null
          is_paid: boolean | null
          net_commission: number | null
          request_fee: number | null
          sessions: number | null
          status: string | null
          therapist_id: string | null
          total_commission: number | null
          total_income: number | null
          work_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      app_role: { Args: never; Returns: string }
      assistant_sql: { Args: { query: string }; Returns: Json }
      hourly_density: {
        Args: { from_date?: string }
        Returns: {
          hour: number
          revenue: number
          sessions: number
          weekday: number
        }[]
      }
      next_receipt_no: { Args: { p_date?: string }; Returns: string }
      promo_key: { Args: { txt: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
