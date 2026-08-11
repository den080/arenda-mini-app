export type UserRole = 'landlord' | 'tenant'

export interface User {
  id: string
  telegram_id: number
  full_name: string
  phone: string
  role: UserRole
  created_at: string
}

export interface Object {
  id: string
  landlord_id: string
  address: string
  notes: string | null
}

export type PaymentMethod = 'card' | 'cash' | 'both'
export type ContractStatus = 'active' | 'ended' | 'terminated'

export interface Contract {
  id: string
  object_id: string
  tenant_id: string
  rent_amount: number
  payment_day: number
  meter_deadline_day: number
  end_date: string
  payment_method: PaymentMethod
  card_number: string | null
  reminder_days_before: number
  status: ContractStatus
}

export interface MeterType {
  id: string
  code: string
  label: string
  unit: string
}

export interface ObjectMeter {
  id: string
  object_id: string
  meter_type_id: string
  is_active: boolean
}

export interface MeterReading {
  id: string
  object_meter_id: string
  contract_id: string
  value: number
  submitted_at: string
  period: string
}

export interface PenaltyRule {
  id: string
  contract_id: string
  violation_type: string
  rate: number
  rate_unit: string
  starts_after_days: number
}

export interface Payment {
  id: string
  contract_id: string
  period: string
  base_amount: number
  penalty_amount: number
  due_date: string
  confirmed_by_landlord: boolean
  confirmed_at: string | null
}

export interface NotificationLog {
  id: string
  user_id: string
  type: string
  related_id: string
  sent_at: string
}
