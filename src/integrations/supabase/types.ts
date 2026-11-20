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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      booking_audit: {
        Row: {
          action: string
          actor: string
          created_at: string
          detail: Json
          id: string
          prereservation_id: string
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          detail?: Json
          id?: string
          prereservation_id: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          detail?: Json
          id?: string
          prereservation_id?: string
        }
        Relationships: []
      }
      checkout_captures: {
        Row: {
          base_city: string
          booking_id: string | null
          created_at: string
          email: string
          expires_at: string
          first_name: string
          id: string
          language: string
          last_name: string
          phone: string
          pickup_at: string
          recovery_attempted_at: string | null
          recovery_error: string | null
          recovery_receipt: string | null
          recovery_sent_at: string | null
          return_at: string
          service_city: string
          status: string
          token: string
          total_usd: number | null
          vehicle_id: string
          vehicle_name: string
          vehicle_slug: string
        }
        Insert: {
          base_city: string
          booking_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          first_name: string
          id?: string
          language: string
          last_name: string
          phone: string
          pickup_at: string
          recovery_attempted_at?: string | null
          recovery_error?: string | null
          recovery_receipt?: string | null
          recovery_sent_at?: string | null
          return_at: string
          service_city: string
          status?: string
          token?: string
          total_usd?: number | null
          vehicle_id: string
          vehicle_name: string
          vehicle_slug: string
        }
        Update: {
          base_city?: string
          booking_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          first_name?: string
          id?: string
          language?: string
          last_name?: string
          phone?: string
          pickup_at?: string
          recovery_attempted_at?: string | null
          recovery_error?: string | null
          recovery_receipt?: string | null
          recovery_sent_at?: string | null
          return_at?: string
          service_city?: string
          status?: string
          token?: string
          total_usd?: number | null
          vehicle_id?: string
          vehicle_name?: string
          vehicle_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_captures_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "prereservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_captures_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          active: boolean
          category_covers: Json
          created_at: string
          delivery_fee_usd: number | null
          delivery_locations: Json
          description_en: string
          description_es: string
          description_pt: string
          fleet_from_city: string
          hero_photo: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_covers?: Json
          created_at?: string
          delivery_fee_usd?: number | null
          delivery_locations?: Json
          description_en?: string
          description_es?: string
          description_pt?: string
          fleet_from_city?: string
          hero_photo?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category_covers?: Json
          created_at?: string
          delivery_fee_usd?: number | null
          delivery_locations?: Json
          description_en?: string
          description_es?: string
          description_pt?: string
          fleet_from_city?: string
          hero_photo?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      document_checks: {
        Row: {
          error: string | null
          folder: string
          results: Json
          state: string
          updated_at: string
        }
        Insert: {
          error?: string | null
          folder: string
          results?: Json
          state?: string
          updated_at?: string
        }
        Update: {
          error?: string | null
          folder?: string
          results?: Json
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      fleet_base_changes: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_email: string
          fleet: string
          id: string
          new_base: Json
          old_base: Json | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string
          fleet: string
          id?: string
          new_base: Json
          old_base?: Json | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string
          fleet?: string
          id?: string
          new_base?: Json
          old_base?: Json | null
        }
        Relationships: []
      }
      fleet_sync_events: {
        Row: {
          action: string
          created_at: string
          event_id: string
          event_type: string
          flags: Json
          origin_vehicle_id: string
          payload_hash: string | null
          site_vehicle_id: string | null
          source_revision: number
        }
        Insert: {
          action: string
          created_at?: string
          event_id: string
          event_type: string
          flags?: Json
          origin_vehicle_id: string
          payload_hash?: string | null
          site_vehicle_id?: string | null
          source_revision: number
        }
        Update: {
          action?: string
          created_at?: string
          event_id?: string
          event_type?: string
          flags?: Json
          origin_vehicle_id?: string
          payload_hash?: string | null
          site_vehicle_id?: string | null
          source_revision?: number
        }
        Relationships: []
      }
      fleet_sync_links: {
        Row: {
          active: boolean
          origin_system: string
          origin_vehicle_id: string
          provenance: string
          reason: string | null
          site_vehicle_id: string
          source_revision: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          origin_system: string
          origin_vehicle_id: string
          provenance?: string
          reason?: string | null
          site_vehicle_id: string
          source_revision: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          origin_system?: string
          origin_vehicle_id?: string
          provenance?: string
          reason?: string | null
          site_vehicle_id?: string
          source_revision?: number
          updated_at?: string
        }
        Relationships: []
      }
      fleet_sync_outbox: {
        Row: {
          attempts: number
          availability: Json | null
          changed_fields: Json | null
          event_id: string
          event_type: string
          http_status: number | null
          last_error: string | null
          next_attempt_at: string
          occurred_at: string
          schema_version: number
          sent_at: string | null
          snapshot: Json
          source_revision: number
          status: string
          vehicle_id: string
        }
        Insert: {
          attempts?: number
          availability?: Json | null
          changed_fields?: Json | null
          event_id?: string
          event_type: string
          http_status?: number | null
          last_error?: string | null
          next_attempt_at?: string
          occurred_at?: string
          schema_version?: number
          sent_at?: string | null
          snapshot: Json
          source_revision?: number
          status?: string
          vehicle_id: string
        }
        Update: {
          attempts?: number
          availability?: Json | null
          changed_fields?: Json | null
          event_id?: string
          event_type?: string
          http_status?: number | null
          last_error?: string | null
          next_attempt_at?: string
          occurred_at?: string
          schema_version?: number
          sent_at?: string | null
          snapshot?: Json
          source_revision?: number
          status?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      fleet_sync_remote_availability: {
        Row: {
          available: boolean
          event_id: string
          ranges: Json
          reason: string | null
          site_vehicle_id: string
          source_revision: number
          updated_at: string
        }
        Insert: {
          available: boolean
          event_id: string
          ranges?: Json
          reason?: string | null
          site_vehicle_id: string
          source_revision: number
          updated_at?: string
        }
        Update: {
          available?: boolean
          event_id?: string
          ranges?: Json
          reason?: string | null
          site_vehicle_id?: string
          source_revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_sync_remote_availability_site_vehicle_id_fkey"
            columns: ["site_vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_reviews_cache: {
        Row: {
          data: Json
          fetched_at: string
          id: number
        }
        Insert: {
          data: Json
          fetched_at?: string
          id?: number
        }
        Update: {
          data?: Json
          fetched_at?: string
          id?: number
        }
        Relationships: []
      }
      identity_verifications: {
        Row: {
          booking_id: string | null
          client_failure_notified_at: string | null
          client_ref: string
          created_at: string
          id: string
          license_country: string
          mode: string
          outputs: Json | null
          owner_failure_notified_at: string | null
          owner_notified_at: string | null
          session_id: string
          status: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          booking_id?: string | null
          client_failure_notified_at?: string | null
          client_ref?: string
          created_at?: string
          id?: string
          license_country: string
          mode: string
          outputs?: Json | null
          owner_failure_notified_at?: string | null
          owner_notified_at?: string | null
          session_id: string
          status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          booking_id?: string | null
          client_failure_notified_at?: string | null
          client_ref?: string
          created_at?: string
          id?: string
          license_country?: string
          mode?: string
          outputs?: Json | null
          owner_failure_notified_at?: string | null
          owner_notified_at?: string | null
          session_id?: string
          status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          channel: string
          created_at: string
          detail: string
          id: string
          kind: string
          prereservation_id: string | null
          recipient: string
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          detail?: string
          id?: string
          kind: string
          prereservation_id?: string | null
          recipient?: string
          status: string
        }
        Update: {
          channel?: string
          created_at?: string
          detail?: string
          id?: string
          kind?: string
          prereservation_id?: string | null
          recipient?: string
          status?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          booking_id: string | null
          created_at: string
          event_id: string | null
          id: string
          outcome: string
          payload: Json
          provider: string
          provider_order_id: string | null
          status: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          outcome?: string
          payload?: Json
          provider: string
          provider_order_id?: string | null
          status?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          outcome?: string
          payload?: Json
          provider?: string
          provider_order_id?: string | null
          status?: string
        }
        Relationships: []
      }
      payment_orphans: {
        Row: {
          amount_usd: number | null
          booking_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          event_id: string | null
          id: string
          provider: string
          reason: string
          ref: string
          resolved_at: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
        }
        Insert: {
          amount_usd?: number | null
          booking_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          event_id?: string | null
          id?: string
          provider?: string
          reason: string
          ref: string
          resolved_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_usd?: number | null
          booking_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          event_id?: string | null
          id?: string
          provider?: string
          reason?: string
          ref?: string
          resolved_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prereservations: {
        Row: {
          addons: Json
          address: string
          airport_mode: string | null
          all_in_daily_usd: number | null
          balance_amount_usd: number | null
          balance_paid_at: string | null
          balance_payment_intent_id: string | null
          balance_session_id: string | null
          base_city: string | null
          base_daily_usd: number | null
          captured_at: string | null
          checkout_capture_token: string | null
          client_type: string | null
          country: string
          created_at: string
          date_of_birth: string | null
          decided_at: string | null
          delivery_address: string | null
          delivery_fee_usd: number | null
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_status: string | null
          delivery_tier: string | null
          delivery_type: string | null
          distance_mi: number | null
          document_ai: Json | null
          documents: Json
          documents_status: string | null
          email: string
          expires_at: string
          fee_amount: number | null
          first_name: string
          flight_number: string | null
          flow: string
          gp_amount_brl: number | null
          gp_installments: number | null
          gp_quote: Json | null
          gp_refund_due_usd: number | null
          gp_refund_marked_at: string | null
          gross_amount: number | null
          gross_currency: string | null
          hold_until: string | null
          id: string
          identity_verification: Json | null
          insurance_choice: string | null
          insurance_denial_reason: string | null
          insurance_reviewed_at: string | null
          insurance_status: string | null
          insurance_us_flow: string | null
          is_test: boolean
          language: string
          last_name: string
          license_expiry: string | null
          license_number: string | null
          logistics_fee_usd: number | null
          logistics_mode: string | null
          measureone_email_sent_at: string | null
          original_vehicle_id: string | null
          original_vehicle_name: string | null
          paid_amount_usd: number | null
          passport_number: string | null
          payment_method: string | null
          payment_mode: string
          payment_provider: string | null
          phone: string
          pickup_at: string
          pickup_location: string
          prereservation_amount_usd: number
          price_breakdown: Json
          provider_checkout_url: string | null
          provider_order_id: string | null
          refund_note: string | null
          refunded_at: string | null
          sistemagestao_error: string | null
          sistemagestao_link: string | null
          sistemagestao_rental_id: string | null
          sistemagestao_rental_number: string | null
          sistemagestao_status: string | null
          sistemagestao_synced_at: string | null
          return_at: string
          return_location: string
          review_reason: string | null
          service_city: string | null
          settled_at: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          stripe_session_id: string | null
          stripe_status: string | null
          substitute_deadline: string | null
          substitute_explicit: boolean
          substitute_info: Json | null
          substitute_offered_at: string | null
          substitute_refund_usd: number | null
          substitute_reminded_at: string | null
          substitute_status: string | null
          terms_accepted_at: string | null
          terms_ip: string | null
          terms_version: string | null
          token: string
          vehicle_id: string | null
          vehicle_name: string
          whatsapp_opt_in: boolean
        }
        Insert: {
          addons?: Json
          address?: string
          airport_mode?: string | null
          all_in_daily_usd?: number | null
          balance_amount_usd?: number | null
          balance_paid_at?: string | null
          balance_payment_intent_id?: string | null
          balance_session_id?: string | null
          base_city?: string | null
          base_daily_usd?: number | null
          captured_at?: string | null
          checkout_capture_token?: string | null
          client_type?: string | null
          country?: string
          created_at?: string
          date_of_birth?: string | null
          decided_at?: string | null
          delivery_address?: string | null
          delivery_fee_usd?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_status?: string | null
          delivery_tier?: string | null
          delivery_type?: string | null
          distance_mi?: number | null
          document_ai?: Json | null
          documents?: Json
          documents_status?: string | null
          email: string
          expires_at: string
          fee_amount?: number | null
          first_name: string
          flight_number?: string | null
          flow?: string
          gp_amount_brl?: number | null
          gp_installments?: number | null
          gp_quote?: Json | null
          gp_refund_due_usd?: number | null
          gp_refund_marked_at?: string | null
          gross_amount?: number | null
          gross_currency?: string | null
          hold_until?: string | null
          id?: string
          identity_verification?: Json | null
          insurance_choice?: string | null
          insurance_denial_reason?: string | null
          insurance_reviewed_at?: string | null
          insurance_status?: string | null
          insurance_us_flow?: string | null
          is_test?: boolean
          language?: string
          last_name: string
          license_expiry?: string | null
          license_number?: string | null
          logistics_fee_usd?: number | null
          logistics_mode?: string | null
          measureone_email_sent_at?: string | null
          original_vehicle_id?: string | null
          original_vehicle_name?: string | null
          paid_amount_usd?: number | null
          passport_number?: string | null
          payment_method?: string | null
          payment_mode?: string
          payment_provider?: string | null
          phone: string
          pickup_at: string
          pickup_location: string
          prereservation_amount_usd: number
          price_breakdown?: Json
          provider_checkout_url?: string | null
          provider_order_id?: string | null
          refund_note?: string | null
          refunded_at?: string | null
          sistemagestao_error?: string | null
          sistemagestao_link?: string | null
          sistemagestao_rental_id?: string | null
          sistemagestao_rental_number?: string | null
          sistemagestao_status?: string | null
          sistemagestao_synced_at?: string | null
          return_at: string
          return_location: string
          review_reason?: string | null
          service_city?: string | null
          settled_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_session_id?: string | null
          stripe_status?: string | null
          substitute_deadline?: string | null
          substitute_explicit?: boolean
          substitute_info?: Json | null
          substitute_offered_at?: string | null
          substitute_refund_usd?: number | null
          substitute_reminded_at?: string | null
          substitute_status?: string | null
          terms_accepted_at?: string | null
          terms_ip?: string | null
          terms_version?: string | null
          token?: string
          vehicle_id?: string | null
          vehicle_name: string
          whatsapp_opt_in?: boolean
        }
        Update: {
          addons?: Json
          address?: string
          airport_mode?: string | null
          all_in_daily_usd?: number | null
          balance_amount_usd?: number | null
          balance_paid_at?: string | null
          balance_payment_intent_id?: string | null
          balance_session_id?: string | null
          base_city?: string | null
          base_daily_usd?: number | null
          captured_at?: string | null
          checkout_capture_token?: string | null
          client_type?: string | null
          country?: string
          created_at?: string
          date_of_birth?: string | null
          decided_at?: string | null
          delivery_address?: string | null
          delivery_fee_usd?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_status?: string | null
          delivery_tier?: string | null
          delivery_type?: string | null
          distance_mi?: number | null
          document_ai?: Json | null
          documents?: Json
          documents_status?: string | null
          email?: string
          expires_at?: string
          fee_amount?: number | null
          first_name?: string
          flight_number?: string | null
          flow?: string
          gp_amount_brl?: number | null
          gp_installments?: number | null
          gp_quote?: Json | null
          gp_refund_due_usd?: number | null
          gp_refund_marked_at?: string | null
          gross_amount?: number | null
          gross_currency?: string | null
          hold_until?: string | null
          id?: string
          identity_verification?: Json | null
          insurance_choice?: string | null
          insurance_denial_reason?: string | null
          insurance_reviewed_at?: string | null
          insurance_status?: string | null
          insurance_us_flow?: string | null
          is_test?: boolean
          language?: string
          last_name?: string
          license_expiry?: string | null
          license_number?: string | null
          logistics_fee_usd?: number | null
          logistics_mode?: string | null
          measureone_email_sent_at?: string | null
          original_vehicle_id?: string | null
          original_vehicle_name?: string | null
          paid_amount_usd?: number | null
          passport_number?: string | null
          payment_method?: string | null
          payment_mode?: string
          payment_provider?: string | null
          phone?: string
          pickup_at?: string
          pickup_location?: string
          prereservation_amount_usd?: number
          price_breakdown?: Json
          provider_checkout_url?: string | null
          provider_order_id?: string | null
          refund_note?: string | null
          refunded_at?: string | null
          sistemagestao_error?: string | null
          sistemagestao_link?: string | null
          sistemagestao_rental_id?: string | null
          sistemagestao_rental_number?: string | null
          sistemagestao_status?: string | null
          sistemagestao_synced_at?: string | null
          return_at?: string
          return_location?: string
          review_reason?: string | null
          service_city?: string | null
          settled_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_session_id?: string | null
          stripe_status?: string | null
          substitute_deadline?: string | null
          substitute_explicit?: boolean
          substitute_info?: Json | null
          substitute_offered_at?: string | null
          substitute_refund_usd?: number | null
          substitute_reminded_at?: string | null
          substitute_status?: string | null
          terms_accepted_at?: string | null
          terms_ip?: string | null
          terms_version?: string | null
          token?: string
          vehicle_id?: string | null
          vehicle_name?: string
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "prereservations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      sistemagestao_outbox: {
        Row: {
          attempts: number
          booking_id: string
          created_at: string
          id: string
          last_error: string | null
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          booking_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          payload: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          booking_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sistemagestao_outbox_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "prereservations"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          addon_hotel_checkin: number
          addon_insurance_per_day: number
          addon_luggage_car: number
          approval_window_hours: number
          balance_deadline_hours: number
          company_zip: string
          contact_email: string
          cutoff_hours_before_pickup: number
          delivery_config: Json
          duration_tiers: Json
          globalpays_live: boolean
          globalpays_live_changed_at: string | null
          globalpays_live_changed_by: string
          google_business_url: string
          gp_interest_free_installments: number
          id: number
          legal_operator_en: string
          legal_operator_es: string
          legal_operator_pt: string
          legal_payments_en: string
          legal_payments_es: string
          legal_payments_pt: string
          measureone_static_link: string
          min_days_by_category: Json
          min_lead_time_hours: number
          msg_approved_en: string
          msg_approved_es: string
          msg_approved_pt: string
          msg_confirmed_en: string
          msg_confirmed_es: string
          msg_confirmed_pt: string
          msg_declined_en: string
          msg_declined_es: string
          msg_declined_pt: string
          msg_expired_en: string
          msg_expired_es: string
          msg_expired_pt: string
          owner_notification_email: string
          payment_company_address: string
          payment_modes: Json
          prereservation_days: number
          prereservation_min_usd: number
          sistemagestao_integration_enabled: boolean
          rentalcover_affiliate_link: string
          substitute_reminder_hours: number
          substitute_window_hours: number
          support_email: string
          terms_version: string
          updated_at: string
          wa_tpl_approved_en: string
          wa_tpl_approved_es: string
          wa_tpl_approved_pt: string
          wa_tpl_confirmed_en: string
          wa_tpl_confirmed_es: string
          wa_tpl_confirmed_pt: string
          wa_tpl_declined_en: string
          wa_tpl_declined_es: string
          wa_tpl_declined_pt: string
          wa_tpl_expired_en: string
          wa_tpl_expired_es: string
          wa_tpl_expired_pt: string
          whatsapp_number: string
          whatsapp_provider: string
        }
        Insert: {
          addon_hotel_checkin?: number
          addon_insurance_per_day?: number
          addon_luggage_car?: number
          approval_window_hours?: number
          balance_deadline_hours?: number
          company_zip?: string
          contact_email?: string
          cutoff_hours_before_pickup?: number
          delivery_config?: Json
          duration_tiers?: Json
          globalpays_live?: boolean
          globalpays_live_changed_at?: string | null
          globalpays_live_changed_by?: string
          google_business_url?: string
          gp_interest_free_installments?: number
          id?: number
          legal_operator_en?: string
          legal_operator_es?: string
          legal_operator_pt?: string
          legal_payments_en?: string
          legal_payments_es?: string
          legal_payments_pt?: string
          measureone_static_link?: string
          min_days_by_category?: Json
          min_lead_time_hours?: number
          msg_approved_en?: string
          msg_approved_es?: string
          msg_approved_pt?: string
          msg_confirmed_en?: string
          msg_confirmed_es?: string
          msg_confirmed_pt?: string
          msg_declined_en?: string
          msg_declined_es?: string
          msg_declined_pt?: string
          msg_expired_en?: string
          msg_expired_es?: string
          msg_expired_pt?: string
          owner_notification_email?: string
          payment_company_address?: string
          payment_modes?: Json
          prereservation_days?: number
          prereservation_min_usd?: number
          sistemagestao_integration_enabled?: boolean
          rentalcover_affiliate_link?: string
          substitute_reminder_hours?: number
          substitute_window_hours?: number
          support_email?: string
          terms_version?: string
          updated_at?: string
          wa_tpl_approved_en?: string
          wa_tpl_approved_es?: string
          wa_tpl_approved_pt?: string
          wa_tpl_confirmed_en?: string
          wa_tpl_confirmed_es?: string
          wa_tpl_confirmed_pt?: string
          wa_tpl_declined_en?: string
          wa_tpl_declined_es?: string
          wa_tpl_declined_pt?: string
          wa_tpl_expired_en?: string
          wa_tpl_expired_es?: string
          wa_tpl_expired_pt?: string
          whatsapp_number?: string
          whatsapp_provider?: string
        }
        Update: {
          addon_hotel_checkin?: number
          addon_insurance_per_day?: number
          addon_luggage_car?: number
          approval_window_hours?: number
          balance_deadline_hours?: number
          company_zip?: string
          contact_email?: string
          cutoff_hours_before_pickup?: number
          delivery_config?: Json
          duration_tiers?: Json
          globalpays_live?: boolean
          globalpays_live_changed_at?: string | null
          globalpays_live_changed_by?: string
          google_business_url?: string
          gp_interest_free_installments?: number
          id?: number
          legal_operator_en?: string
          legal_operator_es?: string
          legal_operator_pt?: string
          legal_payments_en?: string
          legal_payments_es?: string
          legal_payments_pt?: string
          measureone_static_link?: string
          min_days_by_category?: Json
          min_lead_time_hours?: number
          msg_approved_en?: string
          msg_approved_es?: string
          msg_approved_pt?: string
          msg_confirmed_en?: string
          msg_confirmed_es?: string
          msg_confirmed_pt?: string
          msg_declined_en?: string
          msg_declined_es?: string
          msg_declined_pt?: string
          msg_expired_en?: string
          msg_expired_es?: string
          msg_expired_pt?: string
          owner_notification_email?: string
          payment_company_address?: string
          payment_modes?: Json
          prereservation_days?: number
          prereservation_min_usd?: number
          sistemagestao_integration_enabled?: boolean
          rentalcover_affiliate_link?: string
          substitute_reminder_hours?: number
          substitute_window_hours?: number
          support_email?: string
          terms_version?: string
          updated_at?: string
          wa_tpl_approved_en?: string
          wa_tpl_approved_es?: string
          wa_tpl_approved_pt?: string
          wa_tpl_confirmed_en?: string
          wa_tpl_confirmed_es?: string
          wa_tpl_confirmed_pt?: string
          wa_tpl_declined_en?: string
          wa_tpl_declined_es?: string
          wa_tpl_declined_pt?: string
          wa_tpl_expired_en?: string
          wa_tpl_expired_es?: string
          wa_tpl_expired_pt?: string
          whatsapp_number?: string
          whatsapp_provider?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_partners: {
        Row: {
          partner_name: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          partner_name?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          partner_name?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_partners_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_promotions: {
        Row: {
          active: boolean
          created_at: string
          ends_on: string
          id: string
          pct: number
          starts_on: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_on: string
          id?: string
          pct: number
          starts_on: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_on?: string
          id?: string
          pct?: number
          starts_on?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_promotions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          admin_note: string
          allows_one_way: boolean
          bags: number
          blocked_dates: string[]
          body_category: string
          brand: string
          catalog_group: string
          category: string
          city: string
          color: string
          confirmation_type: string
          created_at: string
          daily_price_usd: number | null
          delivery_pricing: Json | null
          delivery_tier_override: string
          description_en: string
          description_es: string
          description_pt: string
          doors: number
          extra_mile_price_usd: number | null
          highlights: string[]
          highlights_es: string[]
          highlights_pt: string[]
          hp: number | null
          id: string
          instant_full_booking: boolean
          insurance_deductible_usd: number | null
          insurance_override: string
          internal_label: string
          is_convertible: boolean
          is_sample: boolean
          mileage_limit: string
          min_age: number
          min_days: number | null
          model: string
          name: string
          owner_type: string | null
          payment_mode: string
          photos: string[]
          prereservation_amount_usd: number | null
          review_category: boolean
          seats: number
          security_deposit_usd: number | null
          slug: string
          sort_order: number
          transmission: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          admin_note?: string
          allows_one_way?: boolean
          bags?: number
          blocked_dates?: string[]
          body_category?: string
          brand?: string
          catalog_group?: string
          category?: string
          city: string
          color?: string
          confirmation_type?: string
          created_at?: string
          daily_price_usd?: number | null
          delivery_pricing?: Json | null
          delivery_tier_override?: string
          description_en?: string
          description_es?: string
          description_pt?: string
          doors?: number
          extra_mile_price_usd?: number | null
          highlights?: string[]
          highlights_es?: string[]
          highlights_pt?: string[]
          hp?: number | null
          id?: string
          instant_full_booking?: boolean
          insurance_deductible_usd?: number | null
          insurance_override?: string
          internal_label?: string
          is_convertible?: boolean
          is_sample?: boolean
          mileage_limit?: string
          min_age?: number
          min_days?: number | null
          model?: string
          name: string
          owner_type?: string | null
          payment_mode?: string
          photos?: string[]
          prereservation_amount_usd?: number | null
          review_category?: boolean
          seats?: number
          security_deposit_usd?: number | null
          slug: string
          sort_order?: number
          transmission?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          admin_note?: string
          allows_one_way?: boolean
          bags?: number
          blocked_dates?: string[]
          body_category?: string
          brand?: string
          catalog_group?: string
          category?: string
          city?: string
          color?: string
          confirmation_type?: string
          created_at?: string
          daily_price_usd?: number | null
          delivery_pricing?: Json | null
          delivery_tier_override?: string
          description_en?: string
          description_es?: string
          description_pt?: string
          doors?: number
          extra_mile_price_usd?: number | null
          highlights?: string[]
          highlights_es?: string[]
          highlights_pt?: string[]
          hp?: number | null
          id?: string
          instant_full_booking?: boolean
          insurance_deductible_usd?: number | null
          insurance_override?: string
          internal_label?: string
          is_convertible?: boolean
          is_sample?: boolean
          mileage_limit?: string
          min_age?: number
          min_days?: number | null
          model?: string
          name?: string
          owner_type?: string | null
          payment_mode?: string
          photos?: string[]
          prereservation_amount_usd?: number | null
          review_category?: boolean
          seats?: number
          security_deposit_usd?: number | null
          slug?: string
          sort_order?: number
          transmission?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_city_fk"
            columns: ["city"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["slug"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_sistemagestao_fleet_event: {
        Args: { e: Json; flags: Json; p: Json }
        Returns: Json
      }
      apply_sistemagestao_fleet_v2: {
        Args: { avail: Json; e: Json; hash: string; patch: Json }
        Returns: Json
      }
      claim_site_fleet_events: {
        Args: { v_id: string }
        Returns: {
          attempts: number
          availability: Json | null
          changed_fields: Json | null
          event_id: string
          event_type: string
          http_status: number | null
          last_error: string | null
          next_attempt_at: string
          occurred_at: string
          schema_version: number
          sent_at: string | null
          snapshot: Json
          source_revision: number
          status: string
          vehicle_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "fleet_sync_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owner_exists: { Args: never; Returns: boolean }
      queue_site_availability: { Args: { vid: string }; Returns: undefined }
      site_vehicle_availability: { Args: { vid: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
