// ─── Supabase client ─────────────────────────────────────────────────────────
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function dbSignUp(email, password, name) {
  const { data, error } = await _sb.auth.signUp({
    email, password,
    options: { data: { name } },
  });
  if (error) throw error;
  return data;
}

async function dbSignIn(email, password) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function dbSignOut() {
  await _sb.auth.signOut();
}

function dbOnAuthChange(callback) {
  return _sb.auth.onAuthStateChange((event, session) => callback(event, session));
}

// ─── Profile ──────────────────────────────────────────────────────────────────
async function dbUpdateProfile(name, color) {
  const { data: { user } } = await _sb.auth.getUser();
  // upsert handles both: update existing profile OR create if missing
  const { error } = await _sb.from('profiles').upsert({
    id: user.id,
    name,
    color,
    email: user.email,
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function dbSearchUserByEmail(email) {
  const { data, error } = await _sb.from('profiles')
    .select('*')
    .ilike('email', email.trim())
    .limit(5);
  if (error) return [];
  return data || [];
}

// ─── Load all app data ────────────────────────────────────────────────────────
async function dbLoadAll() {
  const { data: { user } } = await _sb.auth.getUser();
  if (!user) return null;

  // Fetch profile + group memberships in parallel
  const [profileRes, membershipRes] = await Promise.all([
    _sb.from('profiles').select('*').eq('id', user.id).single(),
    _sb.from('group_members').select('group_id').eq('user_id', user.id),
  ]);

  const profile = profileRes.data;
  const groupIds = membershipRes.data?.map(m => m.group_id) || [];

  if (groupIds.length === 0) {
    return {
      currentUser: user.id,
      users: profile ? [_mapProfile(profile)] : [],
      groups: [], expenses: [], settlements: [],
    };
  }

  // Fetch groups, members, expenses, settlements in parallel
  const [groupsRes, allMembersRes, expensesRes, settlementsRes] = await Promise.all([
    _sb.from('groups').select('*').in('id', groupIds),
    _sb.from('group_members').select('group_id, user_id').in('group_id', groupIds),
    _sb.from('expenses').select('*').in('group_id', groupIds).order('date', { ascending: false }),
    _sb.from('settlements').select('*').or(`from_user.eq.${user.id},to_user.eq.${user.id}`),
  ]);

  // Fetch splits for all expenses
  const expenseIds = expensesRes.data?.map(e => e.id) || [];
  const splitsRes = expenseIds.length > 0
    ? await _sb.from('expense_splits').select('*').in('expense_id', expenseIds)
    : { data: [] };

  // Fetch all member profiles
  const allMemberIds = [...new Set(allMembersRes.data?.map(m => m.user_id) || [])];
  const profilesRes = allMemberIds.length > 0
    ? await _sb.from('profiles').select('*').in('id', allMemberIds)
    : { data: [] };

  // ── Assemble state ──────────────────────────────────────────
  const groups = (groupsRes.data || []).map(g => ({
    id: g.id, name: g.name, icon: g.icon, color: g.color,
    createdAt: g.created_at, createdBy: g.created_by,
    members: (allMembersRes.data || []).filter(m => m.group_id === g.id).map(m => m.user_id),
  }));

  const expenses = (expensesRes.data || []).map(e => ({
    id: e.id, name: e.name, amount: parseFloat(e.amount),
    category: e.category, groupId: e.group_id,
    paidBy: e.paid_by, date: e.date, createdBy: e.created_by,
    splits: (splitsRes.data || [])
      .filter(s => s.expense_id === e.id)
      .map(s => ({ userId: s.user_id, amount: parseFloat(s.amount) })),
  }));

  const settlements = (settlementsRes.data || []).map(s => ({
    id: s.id, from: s.from_user, to: s.to_user,
    amount: parseFloat(s.amount), groupId: s.group_id, date: s.date,
  }));

  const users = (profilesRes.data || []).map(_mapProfile);
  // Ensure current user is always present
  if (!users.find(u => u.id === user.id) && profile) {
    users.push(_mapProfile(profile));
  }

  return { currentUser: user.id, users, groups, expenses, settlements };
}

function _mapProfile(p) {
  return { id: p.id, name: p.name, email: p.email, color: p.color };
}

// ─── Groups ───────────────────────────────────────────────────────────────────
async function dbCreateGroup(name, icon, color) {
  const { data: { user } } = await _sb.auth.getUser();
  const { data: group, error } = await _sb.from('groups')
    .insert({ name, icon, color, created_by: user.id })
    .select().single();
  if (error) throw error;
  // Add creator as first member
  await _sb.from('group_members').insert({ group_id: group.id, user_id: user.id });
  return group;
}

async function dbUpdateGroup(id, name, icon, color) {
  const { error } = await _sb.from('groups').update({ name, icon, color }).eq('id', id);
  if (error) throw error;
}

async function dbDeleteGroup(id) {
  const { error } = await _sb.from('groups').delete().eq('id', id);
  if (error) throw error;
}

async function dbAddGroupMember(groupId, userId) {
  const { error } = await _sb.from('group_members').insert({ group_id: groupId, user_id: userId });
  if (error && error.code !== '23505') throw error; // ignore duplicate
}

async function dbRemoveGroupMember(groupId, userId) {
  const { error } = await _sb.from('group_members').delete()
    .eq('group_id', groupId).eq('user_id', userId);
  if (error) throw error;
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
async function dbCreateExpense(expData, splits) {
  const { data: { user } } = await _sb.auth.getUser();
  const { data: expense, error } = await _sb.from('expenses')
    .insert({
      name: expData.name, amount: expData.amount, category: expData.category,
      group_id: expData.groupId, paid_by: expData.paidBy,
      date: new Date(expData.date).toISOString(), created_by: user.id,
    })
    .select().single();
  if (error) throw error;

  const { error: splitsErr } = await _sb.from('expense_splits').insert(
    splits.map(s => ({ expense_id: expense.id, user_id: s.userId, amount: s.amount }))
  );
  if (splitsErr) throw splitsErr;
  return expense;
}

async function dbDeleteExpense(id) {
  const { error } = await _sb.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ─── Settlements ──────────────────────────────────────────────────────────────
async function dbCreateSettlement(fromId, toId, amount, groupId, date) {
  const { error } = await _sb.from('settlements').insert({
    from_user: fromId, to_user: toId, amount,
    group_id: groupId || null,
    date: new Date(date).toISOString(),
  });
  if (error) throw error;
}

// ─── Real-time subscriptions ──────────────────────────────────────────────────
let _realtimeChannel = null;

function dbSubscribeRealtime(groupIds, onUpdate) {
  if (_realtimeChannel) {
    _sb.removeChannel(_realtimeChannel);
  }
  if (!groupIds.length) return;

  _realtimeChannel = _sb.channel('splitease-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' },         () => onUpdate())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_splits' },   () => onUpdate())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' },      () => onUpdate())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' },    () => onUpdate())
    .subscribe();
}

function dbUnsubscribeRealtime() {
  if (_realtimeChannel) {
    _sb.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}
