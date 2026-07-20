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
      customers: {
        Row: {
          birthday: string | null
          created_at: string
          customer_type: string
          id: string
          line_id: string | null
          name: string
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
          id?: string
          line_id?: string | null
          name: string
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
          id?: string
          line_id?: string | null
          name?: string
          nickname?: string | null
          notes?: string | null
          phone?: string | null
          tags?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
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
          created_at?: string
          expense_date?: string
          id?: string
          item?: string
          notes?: string | null
          paid_by?: string | null
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
          bonus_used: number
          commission: number | null
          coupon_promo: string | null
          created_at: string
          created_by: string | null
          credit_used: number
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          id: string
          is_request: boolean
          member_status: string | null
          net_amount: number
          payment_method: string
          price_normal: number
          receipt_no: string | null
          request_fee: number
          revenue_recognize: number | null
          sale_date: string
          sale_time: string | null
          service_id: string | null
          service_name: string | null
          therapist_id: string | null
        }
        Insert: {
          bonus_used?: number
          commission?: number | null
          coupon_promo?: string | null
          created_at?: string
          created_by?: string | null
          credit_used?: number
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          is_request?: boolean
          member_status?: string | null
          net_amount: number
          payment_method: string
          price_normal: number
          receipt_no?: string | null
          request_fee?: number
          revenue_recognize?: number | null
          sale_date: string
          sale_time?: string | null
          service_id?: string | null
          service_name?: string | null
          therapist_id?: string | null
        }
        Update: {
          bonus_used?: number
          commission?: number | null
          coupon_promo?: string | null
          created_at?: string
          created_by?: string | null
          credit_used?: number
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          is_request?: boolean
          member_status?: string | null
          net_amount?: number
          payment_method?: string
          price_normal?: number
          receipt_no?: string | null
          request_fee?: number
          revenue_recognize?: number | null
          sale_date?: string
          sale_time?: string | null
          service_id?: string | null
          service_name?: string | null
          therapist_id?: string | null
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
          id: string
          is_active: boolean
          name: string
          price: number
          price_old: number | null
        }
        Insert: {
          commission: number
          commission_old?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          price_old?: number | null
        }
        Update: {
          commission?: number
          commission_old?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
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
          credit_balance: number | null
          credit_granted: number | null
          customer_id: string | null
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
          gross_sales: number | null
          net_revenue: number | null
          sale_date: string | null
          sessions: number | null
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
          profit_accrual: number | null
          profit_cash: number | null
          sessions: number | null
          variable_cost: number | null
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
      next_receipt_no: { Args: { p_date?: string }; Returns: string }
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
