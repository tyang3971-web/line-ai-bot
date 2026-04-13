// 家庭共用記帳資料存取
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// 產生 6 碼加入碼
function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

// 建立家庭
export async function createFamily(userId: string, name: string, nickname: string) {
  const joinCode = generateJoinCode()

  const { data: family, error: fErr } = await supabase
    .from('family_groups')
    .insert({ name, join_code: joinCode, created_by: userId })
    .select()
    .single()
  if (fErr) throw fErr

  await supabase.from('family_members').insert({
    family_id: family.id,
    user_id: userId,
    nickname,
  })

  return { familyId: family.id, joinCode, name }
}

// 加入家庭
export async function joinFamily(userId: string, joinCode: string, nickname: string) {
  const { data: family } = await supabase
    .from('family_groups')
    .select('id, name')
    .eq('join_code', joinCode.toUpperCase())
    .single()

  if (!family) return null

  // 檢查是否已加入
  const { data: existing } = await supabase
    .from('family_members')
    .select('id')
    .eq('family_id', family.id)
    .eq('user_id', userId)
    .single()

  if (existing) return { alreadyJoined: true, familyName: family.name }

  await supabase.from('family_members').insert({
    family_id: family.id,
    user_id: userId,
    nickname,
  })

  return { familyId: family.id, familyName: family.name }
}

// 取得用戶所屬家庭
export async function getUserFamily(userId: string) {
  const { data } = await supabase
    .from('family_members')
    .select('family_id, nickname, family_groups(id, name, join_code)')
    .eq('user_id', userId)
    .single()

  if (!data) return null
  const fg = data.family_groups as unknown as { id: string; name: string; join_code: string }
  return {
    familyId: fg.id,
    familyName: fg.name,
    joinCode: fg.join_code,
    nickname: data.nickname,
  }
}

// 取得家庭成員
export async function getFamilyMembers(familyId: string) {
  const { data } = await supabase
    .from('family_members')
    .select('user_id, nickname, joined_at')
    .eq('family_id', familyId)
    .order('joined_at')

  return data || []
}

// 記帳
export async function saveFamilyExpense(params: {
  familyId: string
  userId: string
  nickname: string
  amount: number
  category: string
  description: string
}) {
  const { error } = await supabase.from('family_expenses').insert({
    family_id: params.familyId,
    user_id: params.userId,
    nickname: params.nickname,
    amount: params.amount,
    category: params.category,
    description: params.description,
  })
  if (error) throw error
}

// 月報
export async function getFamilyMonthlyStats(familyId: string) {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('family_expenses')
    .select('amount, category, description, nickname, created_at')
    .eq('family_id', familyId)
    .gte('created_at', startOfMonth.toISOString())
    .order('created_at', { ascending: false })

  const items = data || []
  const total = items.reduce((sum, e) => sum + e.amount, 0)

  const byCategory: Record<string, number> = {}
  const byMember: Record<string, number> = {}
  for (const e of items) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
    byMember[e.nickname || '未知'] = (byMember[e.nickname || '未知'] || 0) + e.amount
  }

  return { total, byCategory, byMember, items, count: items.length }
}

// 週報
export async function getFamilyWeeklyStats(familyId: string) {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data } = await supabase
    .from('family_expenses')
    .select('amount, category, description, nickname, created_at')
    .eq('family_id', familyId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })

  const items = data || []
  const total = items.reduce((sum, e) => sum + e.amount, 0)

  return { total, items, count: items.length }
}
