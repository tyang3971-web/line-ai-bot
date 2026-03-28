// 記帳資料存取（使用 Supabase）
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export type Expense = {
  id?: string
  user_id: string
  amount: number
  category: string
  description: string
  created_at?: string
}

export async function saveExpense(expense: Omit<Expense, 'id' | 'created_at'>) {
  const { error } = await supabase.from('expenses').insert(expense)
  if (error) throw error
}

export async function getMonthlyStats(userId: string) {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('expenses')
    .select('amount, category, description, created_at')
    .eq('user_id', userId)
    .gte('created_at', startOfMonth.toISOString())
    .order('created_at', { ascending: false })

  const items = data || []
  const total = items.reduce((sum, e) => sum + e.amount, 0)

  // 按類別加總
  const byCategory: Record<string, number> = {}
  for (const e of items) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
  }

  return { total, byCategory, items, count: items.length }
}

export async function getWeeklyStats(userId: string) {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data } = await supabase
    .from('expenses')
    .select('amount, category, description, created_at')
    .eq('user_id', userId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })

  const items = data || []
  const total = items.reduce((sum, e) => sum + e.amount, 0)

  return { total, items, count: items.length }
}
