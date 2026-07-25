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
      customers: {
        Row: {
          birthday: string | null
          created_at: string
          customer_type: string
          gender: string | null
          id: string
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
          birthday?: string | null
          created_at?: string
          customer_type?: string
          gender?: string | null
          id?: string
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
          birthday?: string | null
          created_at?: string
          customer_type?: string
          gender?: string | null
          id?: string
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
      promotions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
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
        Relationships: []
      }
      queue_entries: {
        Row: {
          bed_id: string | null
          booking_channel: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          group_id: string | null
          customer_phone: string | null
          is_request: boolean
          duration_min: number
          id: string
          line_user_id: string | null
          notes: string | null
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
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          group_id?: string | null
          customer_phone?: string | null
          is_request?: boolean
          duration_min: number
          id?: string
          line_user_id?: string | null
          notes?: string | null
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
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          group_id?: string | null
          customer_phone?: string | null
          is_request?: boolean
          duration_min?: number
          id?: string
          line_user_id?: string | null
          notes?: string | null
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
        Relationships: []
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
          bonus_used: number
          booking_channel: string | null
          commission: number | null
          coupon_promo: string | null
          credit_after: number | null
          created_at: string
          created_by: string | null
          credit_used: number
          edited_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          id: string
          group_id: string | null
          is_request: boolean
          member_status: string | null
          net_amount: number
          notes: string | null
          payment_method: string
          price_normal: number
          receipt_no: string | null
          request_fee: number
          revenue_recognize: number | null
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
          bonus_used?: number
          booking_channel?: string | null
          commission?: number | null
          coupon_promo?: string | null
          credit_after?: number | null
          created_at?: string
          created_by?: string | null
          credit_used?: number
          edited_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          group_id?: string | null
          is_request?: boolean
          member_status?: string | null
          net_amount: number
          notes?: string | null
          payment_method: string
          price_normal: number
          receipt_no?: string | null
          request_fee?: number
          revenue_recognize?: number | null
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
          bonus_used?: number
          booking_channel?: string | null
          commission?: number | null
          coupon_promo?: string | null
          credit_after?: number | null
          created_at?: string
          created_by?: string | null
          credit_used?: number
          edited_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          group_id?: string | null
          is_request?: boolean
          member_status?: string | null
          net_amount?: number
          notes?: string | null
          payment_method?: string
          price_normal?: number
          receipt_no?: string | null
          request_fee?: number
          revenue_recognize?: number | null
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
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
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
      v_hourly_density: {
        Row: {
          hour: number | null
          revenue: number | null
          sessions: number | null
          weekday: number | null
        }
        Relationships: []
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
        Relationships: []
      }
    }
    Functions: {
      app_role: { Args: never; Returns: string }
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

type DefaultSchema = Database["public"]

export type Tables<
  T extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]),
> = (DefaultSchema["Tables"] & DefaultSchema["Views"])[T] extends {
  Row: infer R
}
  ? R
  : never

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Insert: infer I } ? I : never

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Update: infer U } ? U : never
