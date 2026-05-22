// ─── Constants ───────────────────────────────────────────────────────────────
const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899','#6366f1','#0ea5e9'];
const CATEGORIES = [
  { id: 'food',          icon: '🍕', name: 'Food' },
  { id: 'transport',     icon: '🚗', name: 'Transport' },
  { id: 'housing',       icon: '🏠', name: 'Housing' },
  { id: 'entertainment', icon: '🎬', name: 'Fun' },
  { id: 'utilities',     icon: '💡', name: 'Bills' },
  { id: 'groceries',     icon: '🛒', name: 'Groceries' },
  { id: 'travel',        icon: '✈️', name: 'Travel' },
  { id: 'health',        icon: '💊', name: 'Health' },
  { id: 'shopping',      icon: '🛍️', name: 'Shopping' },
  { id: 'other',         icon: '📦', name: 'Other' },
];
const GROUP_ICONS   = ['🏠','✈️','🍕','🎉','💼','🎮','🏋️','🎓','🎵','🌴','🚗','⚽'];
const GROUP_COLORS  = ['#3b82f6','#ef4444','#22c55e','#f97316','#8b5cf6','#ec4899','#14b8a6','#eab308'];

// ─── App state ───────────────────────────────────────────────────────────────
let state = { currentUser: null, users: [], groups: [], expenses: [], settlements: [] };
let currentPage    = 'dashboard';
let currentGroupId = null;
let _isLoading     = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function uid() { return '_' + Math.random().toString(36).slice(2, 9); }
function fmt(amount) { return '$' + Math.abs(amount).toFixed(2); }
function getUser(id)     { return state.users.find(u => u.id === id); }
function getGroup(id)    { return state.groups.find(g => g.id === id); }
function getCategory(id) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1]; }
function initials(name)  { return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function colorFor(uid)   { const u = getUser(uid); return u ? u.color : '#9ca3af'; }

function avatarHtml(userId, size = 32) {
  const u = getUser(userId);
  if (!u) return `<div class="avatar" style="width:${size}px;height:${size}px;background:#9ca3af;font-size:${Math.floor(size*.36)}px">?</div>`;
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${u.color};font-size:${Math.floor(size*.36)}px">${initials(u.name)}</div>`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupDate(iso) {
  const d = new Date(iso), today = new Date(), yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function toast(msg, type = 'default') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ─── Loading overlay ─────────────────────────────────────────────────────────
function setLoading(on) {
  _isLoading = on;
  let overlay = document.getElementById('loading-overlay');
  if (on && !overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `<div class="spinner"></div>`;
    document.body.appendChild(overlay);
  } else if (!on && overlay) {
    overlay.remove();
  }
}

// ─── Data refresh ────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const data = await dbLoadAll();
    if (data) {
      state = data;
      // Subscribe to real-time updates
      dbSubscribeRealtime(state.groups.map(g => g.id), async () => {
        const fresh = await dbLoadAll();
        if (fresh) { state = fresh; renderContent(); renderSidebar(); }
      });
    }
  } catch (err) {
    console.error('loadData error:', err);
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function showAuthPage(tab = 'login') {
  document.getElementById('app-shell').style.display = 'none';
  let authEl = document.getElementById('auth-page');
  if (!authEl) {
    authEl = document.createElement('div');
    authEl.id = 'auth-page';
    document.body.insertBefore(authEl, document.getElementById('toast-container'));
  }
  authEl.style.display = 'flex';
  authEl.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">
        <div class="auth-logo-icon">💰</div>
        <div>
          <div class="auth-logo-text">SplitEasy</div>
          <div class="auth-logo-sub">Split expenses with friends</div>
        </div>
      </div>

      <div class="auth-tabs">
        <button class="auth-tab ${tab==='login'?'active':''}"    onclick="showAuthPage('login')">Sign In</button>
        <button class="auth-tab ${tab==='signup'?'active':''}"   onclick="showAuthPage('signup')">Create Account</button>
      </div>

      ${tab === 'login' ? `
        <form id="auth-form" onsubmit="handleLogin(event)">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input id="auth-email" class="form-control" type="email" placeholder="you@example.com" required autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input id="auth-password" class="form-control" type="password" placeholder="••••••••" required>
          </div>
          <button type="submit" class="btn btn-primary auth-submit">Sign In</button>
          <p class="auth-footer-text">Don't have an account? <a href="#" onclick="showAuthPage('signup');return false">Create one →</a></p>
        </form>
      ` : `
        <form id="auth-form" onsubmit="handleSignup(event)">
          <div class="form-group">
            <label class="form-label">Your Name</label>
            <input id="auth-name" class="form-control" type="text" placeholder="Alice Johnson" required autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input id="auth-email" class="form-control" type="email" placeholder="you@example.com" required>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input id="auth-password" class="form-control" type="password" placeholder="At least 6 characters" minlength="6" required>
          </div>
          <button type="submit" class="btn btn-primary auth-submit">Create Account</button>
          <p class="auth-footer-text">Already have an account? <a href="#" onclick="showAuthPage('login');return false">Sign in →</a></p>
        </form>
      `}
    </div>
  `;
}

function hideAuthPage() {
  const el = document.getElementById('auth-page');
  if (el) el.style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
}

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const btn = e.target.querySelector('.auth-submit');
  btn.textContent = 'Signing in…'; btn.disabled = true;
  try {
    await dbSignIn(email, password);
    // onAuthStateChange will fire and call init()
  } catch (err) {
    toast(err.message || 'Sign in failed', 'error');
    btn.textContent = 'Sign In'; btn.disabled = false;
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const name     = document.getElementById('auth-name').value.trim();
  const email    = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const btn = e.target.querySelector('.auth-submit');
  btn.textContent = 'Creating account…'; btn.disabled = true;
  try {
    await dbSignUp(email, password, name);
    toast('Account created! Check your email to confirm (or sign in now if confirmation is disabled).', 'success');
    showAuthPage('login');
  } catch (err) {
    toast(err.message || 'Sign up failed', 'error');
    btn.textContent = 'Create Account'; btn.disabled = false;
  }
}

// ─── Navigation ──────────────────────────────────────────────────────────────
function navigate(page, groupId = null) {
  currentPage    = page;
  currentGroupId = groupId;
  render();
}

// ─── Modal system ─────────────────────────────────────────────────────────────
function showModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}
function closeModal() { document.querySelector('.modal-overlay')?.remove(); }

// ─── Main render ─────────────────────────────────────────────────────────────
function render() {
  renderSidebar();
  renderTopbar();
  renderContent();
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function renderSidebar() {
  const me = getUser(state.currentUser);
  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-logo">
      <div class="logo-icon">💰</div>
      <div class="logo-text">SplitEasy</div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-label">Menu</div>
      <div class="sidebar-item ${currentPage==='dashboard'?'active':''}" onclick="navigate('dashboard')">
        <span class="item-icon">🏠</span> Dashboard
      </div>
      <div class="sidebar-item ${currentPage==='groups'?'active':''}" onclick="navigate('groups')">
        <span class="item-icon">👥</span> Groups
        ${state.groups.length>0?`<span class="badge">${state.groups.length}</span>`:''}
      </div>
      <div class="sidebar-item ${currentPage==='activity'?'active':''}" onclick="navigate('activity')">
        <span class="item-icon">📋</span> Activity
      </div>
      <div class="sidebar-item ${currentPage==='friends'?'active':''}" onclick="navigate('friends')">
        <span class="item-icon">🤝</span> Friends
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-label">Your Groups</div>
      ${state.groups.slice(0,6).map(g=>`
        <div class="sidebar-item ${currentPage==='group-detail'&&currentGroupId===g.id?'active':''}"
             onclick="navigate('group-detail','${g.id}')">
          <span class="item-icon">${g.icon}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.name}</span>
        </div>
      `).join('')}
      ${state.groups.length===0?`<div style="padding:8px 10px;font-size:12px;color:var(--gray-400)">No groups yet</div>`:''}
    </div>
    <div class="sidebar-footer">
      <div class="user-pill" onclick="showEditProfileModal()">
        ${avatarHtml(state.currentUser, 32)}
        <div style="flex:1;min-width:0">
          <div class="name">${me?.name||'You'}</div>
          <div class="role" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${me?.email||''}</div>
        </div>
      </div>
      <div class="sidebar-item" onclick="handleSignOut()" style="color:var(--gray-500);margin-top:4px">
        <span class="item-icon">🚪</span> Sign Out
      </div>
    </div>
  `;
}

async function handleSignOut() {
  dbUnsubscribeRealtime();
  await dbSignOut();
  state = { currentUser: null, users: [], groups: [], expenses: [], settlements: [] };
  showAuthPage('login');
  toast('Signed out');
}

// ─── Topbar ───────────────────────────────────────────────────────────────────
function renderTopbar() {
  const titles = {
    dashboard: 'Dashboard', groups: 'Groups', activity: 'Activity',
    friends: 'Friends', 'group-detail': getGroup(currentGroupId)?.name || 'Group',
  };
  let actions = '';
  if (currentPage==='groups')         actions=`<button class="btn btn-primary" onclick="showAddGroupModal()">＋ New Group</button>`;
  else if (currentPage==='group-detail') actions=`
    <button class="btn btn-secondary" onclick="showAddMemberModal('${currentGroupId}')">＋ Member</button>
    <button class="btn btn-primary"   onclick="showAddExpenseModal('${currentGroupId}')">＋ Expense</button>`;
  else if (currentPage==='dashboard') actions=`<button class="btn btn-primary" onclick="showAddExpenseModal()">＋ Add Expense</button>`;

  document.getElementById('topbar').innerHTML = `
    <div class="topbar-title">${titles[currentPage]||''}</div>
    <div class="topbar-actions">${actions}</div>
  `;
}

// ─── Content router ──────────────────────────────────────────────────────────
function renderContent() {
  const el = document.getElementById('content');
  el.innerHTML = ''; el.className = 'page';
  if (currentPage==='dashboard')    renderDashboard(el);
  else if (currentPage==='groups')       renderGroups(el);
  else if (currentPage==='group-detail') renderGroupDetail(el);
  else if (currentPage==='activity')     renderActivity(el);
  else if (currentPage==='friends')      renderFriends(el);
}

// ─── Balance helpers ─────────────────────────────────────────────────────────
function computeBalances(groupId) {
  const members = groupId ? (getGroup(groupId)?.members || []) : state.users.map(u=>u.id);
  const bal = {};
  members.forEach(id => { bal[id] = 0; });
  state.expenses.filter(e => groupId ? e.groupId===groupId : true).forEach(exp => {
    if (bal[exp.paidBy] !== undefined) bal[exp.paidBy] += exp.amount;
    exp.splits.forEach(s => { if (bal[s.userId] !== undefined) bal[s.userId] -= s.amount; });
  });
  state.settlements.filter(s => groupId ? s.groupId===groupId : true).forEach(s => {
    if (bal[s.from] !== undefined) bal[s.from] += s.amount;
    if (bal[s.to]   !== undefined) bal[s.to]   -= s.amount;
  });
  return bal;
}

function computeSimplifiedDebts(groupId) {
  const balances = computeBalances(groupId);
  const creditors = [], debtors = [];
  Object.entries(balances).forEach(([id, b]) => {
    if (b >  0.005) creditors.push({ id, amount: b });
    if (b < -0.005) debtors.push({ id, amount: -b });
  });
  creditors.sort((a,b)=>b.amount-a.amount);
  debtors.sort((a,b)=>b.amount-a.amount);
  const debts = [];
  let i=0, j=0;
  while (i<creditors.length && j<debtors.length) {
    const pay = Math.min(creditors[i].amount, debtors[j].amount);
    debts.push({ from: debtors[j].id, to: creditors[i].id, amount: pay });
    creditors[i].amount -= pay; debtors[j].amount -= pay;
    if (creditors[i].amount < 0.005) i++;
    if (debtors[j].amount  < 0.005) j++;
  }
  return debts;
}

function myOwedTotal() { return computeSimplifiedDebts(null).filter(d=>d.to===state.currentUser).reduce((s,d)=>s+d.amount,0); }
function myOwesTotal() { return computeSimplifiedDebts(null).filter(d=>d.from===state.currentUser).reduce((s,d)=>s+d.amount,0); }
function myNetBalance() { return myOwedTotal() - myOwesTotal(); }

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard(el) {
  const net=myNetBalance(), owed=myOwedTotal(), owes=myOwesTotal();
  const recentExpenses=[...state.expenses].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
  const myDebts=computeSimplifiedDebts(null).filter(d=>d.from===state.currentUser||d.to===state.currentUser);
  el.innerHTML=`
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">You are owed</div>
        <div class="stat-value green">${fmt(owed)}</div>
        <div class="stat-sub">across all groups</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">You owe</div>
        <div class="stat-value red">${fmt(owes)}</div>
        <div class="stat-sub">across all groups</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Net balance</div>
        <div class="stat-value ${net>=0?'green':'red'}">${net>=0?'+':'-'}${fmt(net)}</div>
        <div class="stat-sub">${net>=0?'overall you are owed':'overall you owe'}</div>
      </div>
    </div>
    <div class="dashboard-grid">
      <div class="card">
        <div class="card-header"><div class="card-title">Recent Expenses</div></div>
        <div class="card-body" style="padding-top:0">
          ${recentExpenses.length===0?`<div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">No expenses yet</div><div class="empty-sub">Create a group and add your first expense</div></div>`
          :recentExpenses.map(e=>renderExpenseRow(e)).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Outstanding Balances</div></div>
        <div class="card-body" style="padding-top:0">
          ${myDebts.length===0?`<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">All settled up!</div><div class="empty-sub">No outstanding balances</div></div>`
          :myDebts.map(d=>{
            const isOwed=d.to===state.currentUser;
            const other=getUser(isOwed?d.from:d.to);
            return `<div class="list-item">
              ${avatarHtml(other?.id,38)}
              <div class="list-item-body">
                <div class="list-item-title">${other?.name||'Unknown'}</div>
                <div class="list-item-sub">${isOwed?'owes you':'you owe'}</div>
              </div>
              <div class="list-item-amount">
                <div class="${isOwed?'amount-owed':'amount-owe'}">${fmt(d.amount)}</div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

function renderExpenseRow(exp) {
  const cat=getCategory(exp.category), payer=getUser(exp.paidBy), group=getGroup(exp.groupId);
  const myShare=exp.splits.find(s=>s.userId===state.currentUser), iPaid=exp.paidBy===state.currentUser;
  const bg={food:'#fef3c7',transport:'#dbeafe',housing:'#f3e8ff',entertainment:'#fce7f3'}[exp.category]||'#f0fdf4';
  const shareHtml=iPaid?`<div class="expense-your-share owed">you paid</div>`
    :myShare?`<div class="expense-your-share owe">your share ${fmt(myShare.amount)}</div>`
    :`<div class="expense-your-share paid">not involved</div>`;
  return `<div class="expense-item">
    <div class="expense-icon" style="background:${bg}">${cat.icon}</div>
    <div class="expense-body">
      <div class="expense-name">${exp.name}</div>
      <div class="expense-meta">${payer?.name||'?'} paid · ${group?group.name:'No group'} · ${formatDate(exp.date)}</div>
    </div>
    <div class="expense-right"><div class="expense-total">${fmt(exp.amount)}</div>${shareHtml}</div>
  </div>`;
}

// ─── Groups ───────────────────────────────────────────────────────────────────
function renderGroups(el) {
  if (state.groups.length===0) {
    el.innerHTML=`<div class="empty-state" style="margin-top:60px">
      <div class="empty-icon">👥</div>
      <div class="empty-title">No groups yet</div>
      <div class="empty-sub">Create a group and invite friends by their email address</div><br>
      <button class="btn btn-primary" onclick="showAddGroupModal()">＋ Create your first group</button>
    </div>`;
    return;
  }
  el.innerHTML=`<div class="groups-grid">${state.groups.map(g=>renderGroupCard(g)).join('')}</div>`;
}

function renderGroupCard(g) {
  const balances=computeBalances(g.id), myBal=balances[state.currentUser]||0;
  const expCount=state.expenses.filter(e=>e.groupId===g.id).length;
  const memberAvatars=g.members.slice(0,4).map(uid=>`
    <div class="member-avatar" style="background:${colorFor(uid)}">${initials(getUser(uid)?.name||'?')}</div>`).join('');
  const extra=g.members.length>4?`<div class="member-avatar" style="background:var(--gray-400)">+${g.members.length-4}</div>`:'';
  const balClass=myBal>0.005?'positive':myBal<-0.005?'negative':'zero';
  const balText=myBal>0.005?`you are owed ${fmt(myBal)}`:myBal<-0.005?`you owe ${fmt(myBal)}`:'settled up';
  return `<div class="group-card" onclick="navigate('group-detail','${g.id}')">
    <div class="group-card-header">
      <div class="group-icon" style="background:${g.color}22">${g.icon}</div>
      <div><div class="group-name">${g.name}</div><div class="group-meta">${g.members.length} members · ${expCount} expense${expCount!==1?'s':''}</div></div>
    </div>
    <div class="group-members">${memberAvatars}${extra}</div>
    <div class="group-balance ${balClass}">${balText}</div>
  </div>`;
}

// ─── Group Detail ─────────────────────────────────────────────────────────────
function renderGroupDetail(el) {
  const group=getGroup(currentGroupId);
  if (!group) { navigate('groups'); return; }
  const expenses=[...state.expenses.filter(e=>e.groupId===currentGroupId)].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const debts=computeSimplifiedDebts(currentGroupId);
  const balances=computeBalances(currentGroupId);

  el.innerHTML=`
    <button class="back-btn" onclick="navigate('groups')">← Back to Groups</button>
    <div class="group-detail-header">
      <div class="group-detail-top">
        <div class="group-detail-icon" style="background:${group.color}22">${group.icon}</div>
        <div>
          <div class="group-detail-name">${group.name}</div>
          <div class="group-detail-sub">${group.members.length} members · created ${formatDate(group.createdAt)}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">
          ${group.createdBy===state.currentUser?`<button class="btn btn-secondary btn-sm" onclick="showEditGroupModal('${group.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteGroup('${group.id}')">Delete</button>`:''}
        </div>
      </div>
      ${debts.length>0?`
        <div style="font-size:13px;font-weight:600;color:var(--gray-600);margin-bottom:10px">Balances</div>
        <div class="balance-list">
          ${debts.map(d=>{
            const isMe=d.from===state.currentUser, isMeTo=d.to===state.currentUser;
            return `<div class="balance-row">
              ${avatarHtml(d.from,28)}<span class="from">${getUser(d.from)?.name}</span>
              <span class="arrow">owes</span>
              ${avatarHtml(d.to,28)}<span class="to">${getUser(d.to)?.name}</span>
              <span class="bal-amount ${isMe?'owe':isMeTo?'owed':''}">${fmt(d.amount)}</span>
              ${(isMe||isMeTo)?`<button class="settle-btn" onclick="settleDebt('${d.from}','${d.to}',${d.amount},'${group.id}')">Settle</button>`:''}
            </div>`;
          }).join('')}
        </div>`:`
        <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--green-light);border-radius:8px;font-size:13px;color:var(--green-dark);font-weight:600">
          ✅ All settled up in this group!
        </div>`}
    </div>
    <div class="detail-grid">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Expenses (${expenses.length})</div>
          <button class="btn btn-primary btn-sm" onclick="showAddExpenseModal('${group.id}')">＋ Add</button>
        </div>
        <div class="card-body" style="padding-top:0">
          ${expenses.length===0?`<div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">No expenses yet</div></div>`
          :expenses.map(e=>renderExpenseRowWithActions(e)).join('')}
        </div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <div class="card-title">Members (${group.members.length})</div>
            <button class="btn btn-secondary btn-sm" onclick="showAddMemberModal('${group.id}')">＋ Add</button>
          </div>
          <div class="card-body" style="padding-top:0">
            <div class="members-list">
              ${group.members.map(uid=>{
                const u=getUser(uid), bal=balances[uid]||0;
                const bc=bal>0.005?'pos':bal<-0.005?'neg':'zero';
                const bt=bal>0.005?`+${fmt(bal)}`:bal<-0.005?`-${fmt(bal)}`:'settled';
                return `<div class="member-row">
                  ${avatarHtml(uid,32)}
                  <span class="member-name">${u?.name}${uid===state.currentUser?' (you)':''}</span>
                  <span class="member-balance ${bc}">${bt}</span>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Quick Stats</div></div>
          <div class="card-body">
            <div style="display:flex;flex-direction:column;gap:12px">
              ${[
                {label:'Total expenses',   value:fmt(expenses.reduce((s,e)=>s+e.amount,0))},
                {label:'Number of expenses',value:expenses.length},
                {label:'Average expense',  value:expenses.length?fmt(expenses.reduce((s,e)=>s+e.amount,0)/expenses.length):'$0.00'},
              ].map(r=>`<div style="display:flex;justify-content:space-between;font-size:13px">
                <span style="color:var(--gray-500)">${r.label}</span>
                <span style="font-weight:600;color:var(--gray-800)">${r.value}</span>
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderExpenseRowWithActions(exp) {
  const cat=getCategory(exp.category), payer=getUser(exp.paidBy);
  const myShare=exp.splits.find(s=>s.userId===state.currentUser), iPaid=exp.paidBy===state.currentUser;
  const bg={food:'#fef3c7',transport:'#dbeafe',housing:'#f3e8ff',entertainment:'#fce7f3'}[exp.category]||'#f0fdf4';
  const shareHtml=iPaid?`<div class="expense-your-share owed">you paid</div>`
    :myShare?`<div class="expense-your-share owe">your share ${fmt(myShare.amount)}</div>`
    :`<div class="expense-your-share paid">not involved</div>`;
  const canDelete=exp.createdBy===state.currentUser||exp.paidBy===state.currentUser;
  return `<div class="expense-item">
    <div class="expense-icon" style="background:${bg}">${cat.icon}</div>
    <div class="expense-body">
      <div class="expense-name">${exp.name}</div>
      <div class="expense-meta">${payer?.name} paid · ${formatDate(exp.date)}</div>
    </div>
    <div class="expense-right" style="display:flex;align-items:center;gap:10px">
      <div><div class="expense-total">${fmt(exp.amount)}</div>${shareHtml}</div>
      ${canDelete?`<button class="btn btn-secondary btn-sm btn-icon" onclick="confirmDeleteExpense('${exp.id}')" title="Delete">🗑</button>`:''}
    </div>
  </div>`;
}

// ─── Activity ─────────────────────────────────────────────────────────────────
function renderActivity(el) {
  const allEvents=[
    ...state.expenses.map(e=>({...e,type:'expense',sortDate:e.date})),
    ...state.settlements.map(s=>({...s,type:'settlement',sortDate:s.date})),
  ].sort((a,b)=>new Date(b.sortDate)-new Date(a.sortDate));
  if (!allEvents.length) {
    el.innerHTML=`<div class="empty-state" style="margin-top:80px"><div class="empty-icon">📋</div><div class="empty-title">No activity yet</div></div>`;
    return;
  }
  const grouped={};
  allEvents.forEach(ev=>{ const k=groupDate(ev.sortDate); if(!grouped[k])grouped[k]=[]; grouped[k].push(ev); });
  el.innerHTML=`<div class="card"><div class="card-body">
    ${Object.entries(grouped).map(([date,events])=>`
      <div class="activity-date-group">
        <div class="activity-date-label">${date}</div>
        ${events.map(ev=>{
          if(ev.type==='expense'){
            const cat=getCategory(ev.category),payer=getUser(ev.paidBy),group=getGroup(ev.groupId);
            return `<div class="list-item">
              <div class="list-item-icon" style="background:#f0fdf4;font-size:18px">${cat.icon}</div>
              <div class="list-item-body"><div class="list-item-title">${ev.name}</div><div class="list-item-sub">${payer?.name} paid · ${group?.name||'No group'}</div></div>
              <div class="list-item-amount"><div style="font-weight:700;color:var(--gray-800)">${fmt(ev.amount)}</div><div class="amount-label">${ev.splits.length} people</div></div>
            </div>`;
          } else {
            const from=getUser(ev.from),to=getUser(ev.to),group=getGroup(ev.groupId);
            return `<div class="list-item">
              <div class="list-item-icon" style="background:#e8faf6;font-size:18px">✅</div>
              <div class="list-item-body"><div class="list-item-title">${from?.name} paid ${to?.name}</div><div class="list-item-sub">Settlement · ${group?.name||'General'}</div></div>
              <div class="list-item-amount"><div style="font-weight:700;color:var(--green-dark)">${fmt(ev.amount)}</div></div>
            </div>`;
          }
        }).join('')}
      </div>`).join('')}
  </div></div>`;
}

// ─── Friends ──────────────────────────────────────────────────────────────────
function renderFriends(el) {
  const friends=state.users.filter(u=>u.id!==state.currentUser);
  const allDebts=computeSimplifiedDebts(null);
  el.innerHTML=`<div class="card"><div class="card-body" style="padding-top:0">
    ${friends.length===0?`<div class="empty-state"><div class="empty-icon">🤝</div><div class="empty-title">No friends yet</div><div class="empty-sub">Add people to a group — they'll appear here</div></div>`
    :friends.map(u=>{
      const owed=allDebts.filter(d=>d.to===u.id&&d.from===state.currentUser).reduce((s,d)=>s+d.amount,0);
      const owes=allDebts.filter(d=>d.from===u.id&&d.to===state.currentUser).reduce((s,d)=>s+d.amount,0);
      const net=owes-owed;
      return `<div class="list-item">
        ${avatarHtml(u.id,40)}
        <div class="list-item-body">
          <div class="list-item-title">${u.name}</div>
          <div class="list-item-sub">${u.email}</div>
        </div>
        <span class="tag ${net>0.005?'tag-green':net<-0.005?'tag-red':'tag-gray'}">${net>0.005?`owes you ${fmt(net)}`:net<-0.005?`you owe ${fmt(net)}`:'settled'}</span>
      </div>`;
    }).join('')}
  </div></div>`;
}

// ─── Modal: Add Group ─────────────────────────────────────────────────────────
window._selIcon  = GROUP_ICONS[0];
window._selColor = GROUP_COLORS[0];

function showAddGroupModal(editId=null) {
  const g=editId?getGroup(editId):null;
  window._selIcon  = g?.icon  || GROUP_ICONS[0];
  window._selColor = g?.color || GROUP_COLORS[0];
  showModal(`
    <div class="modal-header">
      <div class="modal-title">${g?'Edit Group':'New Group'}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Group Name</label>
        <input id="grp-name" class="form-control" placeholder="e.g. Apartment, NYC Trip…" value="${g?.name||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Icon</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="icon-picker">
          ${GROUP_ICONS.map(icon=>`<button class="category-btn ${icon===window._selIcon?'selected':''}" data-icon="${icon}" onclick="selectGroupIcon(this,'${icon}')"><span class="cat-icon">${icon}</span></button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${GROUP_COLORS.map(c=>`<div onclick="selectGroupColor(this,'${c}')" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===window._selColor?'#1f2937':'transparent'};transition:border .15s" data-color="${c}"></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveGroup('${editId||''}')"> ${g?'Save Changes':'Create Group'}</button>
    </div>`);
}

function showEditGroupModal(id) { showAddGroupModal(id); }
function selectGroupIcon(el, icon)   { window._selIcon=icon;  document.querySelectorAll('#icon-picker .category-btn').forEach(b=>b.classList.remove('selected')); el.classList.add('selected'); }
function selectGroupColor(el, color) { window._selColor=color; document.querySelectorAll('[data-color]').forEach(b=>b.style.borderColor='transparent'); el.style.borderColor='#1f2937'; }

async function saveGroup(editId) {
  const name=document.getElementById('grp-name').value.trim();
  if (!name) { toast('Please enter a group name','error'); return; }
  const icon=window._selIcon||GROUP_ICONS[0], color=window._selColor||GROUP_COLORS[0];
  setLoading(true);
  try {
    if (editId) { await dbUpdateGroup(editId,name,icon,color); toast('Group updated!','success'); }
    else        { await dbCreateGroup(name,icon,color);         toast('Group created!','success'); }
    await loadData();
    closeModal(); render();
  } catch(err) { toast(err.message||'Failed to save group','error'); }
  finally { setLoading(false); }
}

// ─── Modal: Add Member ────────────────────────────────────────────────────────
function showAddMemberModal(groupId) {
  const group=getGroup(groupId);
  showModal(`
    <div class="modal-header">
      <div class="modal-title">Add Member to ${group.name}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Search by email address</label>
        <div style="display:flex;gap:8px">
          <input id="member-email" class="form-control" type="email" placeholder="friend@example.com">
          <button class="btn btn-secondary" onclick="searchMember()">Search</button>
        </div>
        <div class="form-hint">They must have a SplitEasy account first</div>
      </div>
      <div id="member-search-results"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    </div>`);
}

async function searchMember() {
  const email=document.getElementById('member-email').value.trim();
  if (!email) return;
  const res=document.getElementById('member-search-results');
  res.innerHTML=`<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Searching…</div>`;
  const users=await dbSearchUserByEmail(email);
  const group=getGroup(currentGroupId);
  const available=users.filter(u=>u.id!==state.currentUser&&!group.members.includes(u.id));
  if (!available.length) {
    res.innerHTML=`<div style="font-size:13px;color:var(--gray-500);padding:8px 0">No user found with that email. They need to register first.</div>`;
    return;
  }
  res.innerHTML=available.map(u=>`
    <div class="list-item" style="padding:10px 0">
      <div class="avatar" style="width:36px;height:36px;background:${u.color||'#6366f1'};font-size:13px">${initials(u.name)}</div>
      <div class="list-item-body"><div class="list-item-title">${u.name}</div><div class="list-item-sub">${u.email}</div></div>
      <button class="btn btn-primary btn-sm" onclick="addMemberById('${currentGroupId}','${u.id}','${u.name}')">Add</button>
    </div>`).join('');
}

async function addMemberById(groupId, userId, name) {
  setLoading(true);
  try {
    await dbAddGroupMember(groupId, userId);
    await loadData();
    closeModal();
    toast(`${name} added to group!`, 'success');
    render();
  } catch(err) { toast(err.message||'Failed to add member','error'); }
  finally { setLoading(false); }
}

// ─── Modal: Add Expense ───────────────────────────────────────────────────────
let _splitType='equal', _selectedCategory='food';

function showAddExpenseModal(groupId=null) {
  _splitType='equal'; _selectedCategory='food';
  const gid=groupId||(state.groups[0]?.id||'');
  const group=gid?getGroup(gid):null;
  const members=group?group.members:[state.currentUser];
  showModal(`
    <div class="modal-header">
      <div class="modal-title">Add Expense</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Description</label>
        <input id="exp-name" class="form-control" placeholder="e.g. Dinner, Uber, Netflix…" autofocus>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Amount ($)</label>
          <input id="exp-amount" class="form-control" type="number" min="0.01" step="0.01" placeholder="0.00" oninput="renderSplitInputs()">
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input id="exp-date" class="form-control" type="date" value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <div class="category-grid">
          ${CATEGORIES.map(c=>`<button class="category-btn ${c.id===_selectedCategory?'selected':''}" onclick="selectCategory(this,'${c.id}')"><span class="cat-icon">${c.icon}</span><span class="cat-name">${c.name}</span></button>`).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Group</label>
          <select id="exp-group" class="form-control" onchange="updateExpenseMembers()">
            ${state.groups.map(g=>`<option value="${g.id}" ${g.id===gid?'selected':''}>${g.icon} ${g.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Paid by</label>
          <select id="exp-paidby" class="form-control">
            ${members.map(uid=>`<option value="${uid}" ${uid===state.currentUser?'selected':''}>${getUser(uid)?.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Split</label>
        <div class="split-type-tabs">
          <button class="split-tab active"  onclick="setSplitType(this,'equal')">Equal</button>
          <button class="split-tab"         onclick="setSplitType(this,'exact')">Exact</button>
          <button class="split-tab"         onclick="setSplitType(this,'percent')">Percent</button>
        </div>
        <div id="splits-container"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveExpense()">Add Expense</button>
    </div>`);
  updateExpenseMembers();
}

function selectCategory(el, id) {
  _selectedCategory=id;
  document.querySelectorAll('.category-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
}

function setSplitType(el, type) {
  _splitType=type;
  document.querySelectorAll('.split-tab').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderSplitInputs();
}

function updateExpenseMembers() {
  const gid=document.getElementById('exp-group')?.value;
  const group=gid?getGroup(gid):null;
  const members=group?group.members:[state.currentUser];
  const pb=document.getElementById('exp-paidby');
  if(pb) pb.innerHTML=members.map(uid=>`<option value="${uid}" ${uid===state.currentUser?'selected':''}>${getUser(uid)?.name}</option>`).join('');
  renderSplitInputs();
}

function renderSplitInputs() {
  const container=document.getElementById('splits-container');
  if(!container) return;
  const gid=document.getElementById('exp-group')?.value;
  const group=gid?getGroup(gid):null;
  const members=group?group.members:[state.currentUser];
  const amount=parseFloat(document.getElementById('exp-amount')?.value)||0;
  if(_splitType==='equal') {
    container.innerHTML=`<div style="font-size:13px;color:var(--gray-500)">Split equally among selected members</div>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">
        ${members.map(uid=>`<div class="checkbox-row"><input type="checkbox" id="split-chk-${uid}" checked value="${uid}"><label for="split-chk-${uid}" style="display:flex;align-items:center;gap:8px">${avatarHtml(uid,22)} ${getUser(uid)?.name}${uid===state.currentUser?' (you)':''}</label></div>`).join('')}
      </div>`;
  } else if(_splitType==='exact') {
    const share=(amount/members.length).toFixed(2);
    container.innerHTML=`<div class="splits-grid">
      ${members.map(uid=>`<div class="split-input-row">${avatarHtml(uid,24)}<span class="split-name">${getUser(uid)?.name}</span><input type="number" id="split-exact-${uid}" min="0" step="0.01" value="${share}"></div>`).join('')}
    </div>`;
  } else {
    const pct=Math.round(100/members.length);
    container.innerHTML=`<div class="splits-grid">
      ${members.map(uid=>`<div class="split-input-row">${avatarHtml(uid,24)}<span class="split-name">${getUser(uid)?.name}</span><input type="number" id="split-pct-${uid}" min="0" max="100" step="1" value="${pct}"><span style="font-size:12px;color:var(--gray-400)">%</span></div>`).join('')}
    </div>`;
  }
}

async function saveExpense() {
  const name   = document.getElementById('exp-name').value.trim();
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const date   = document.getElementById('exp-date').value;
  const gid    = document.getElementById('exp-group').value;
  const paidBy = document.getElementById('exp-paidby').value;
  if (!name)              { toast('Enter a description','error'); return; }
  if (!amount||amount<=0) { toast('Enter a valid amount','error'); return; }
  if (!gid)               { toast('Select a group','error'); return; }

  const members=getGroup(gid)?.members||[state.currentUser];
  let splits=[];

  if(_splitType==='equal'){
    const checked=members.filter(uid=>document.getElementById(`split-chk-${uid}`)?.checked);
    if(!checked.length){ toast('Select at least one person','error'); return; }
    const share=amount/checked.length;
    splits=checked.map(uid=>({userId:uid, amount:parseFloat(share.toFixed(2))}));
    const diff=amount-splits.reduce((s,x)=>s+x.amount,0);
    if(splits.length) splits[0].amount=parseFloat((splits[0].amount+diff).toFixed(2));
  } else if(_splitType==='exact'){
    splits=members.map(uid=>({userId:uid, amount:parseFloat(document.getElementById(`split-exact-${uid}`)?.value||0)})).filter(s=>s.amount>0);
    const total=splits.reduce((s,x)=>s+x.amount,0);
    if(Math.abs(total-amount)>0.01){ toast(`Splits must total ${fmt(amount)} (currently ${fmt(total)})`,'error'); return; }
  } else {
    splits=members.map(uid=>{ const pct=parseFloat(document.getElementById(`split-pct-${uid}`)?.value||0); return {userId:uid, amount:parseFloat((amount*pct/100).toFixed(2))}; }).filter(s=>s.amount>0);
    const totalPct=members.reduce((s,uid)=>s+parseFloat(document.getElementById(`split-pct-${uid}`)?.value||0),0);
    if(Math.abs(totalPct-100)>1){ toast('Percentages must add up to 100%','error'); return; }
  }

  setLoading(true);
  try {
    await dbCreateExpense({name, amount, category:_selectedCategory, groupId:gid, paidBy, date}, splits);
    await loadData();
    closeModal(); toast('Expense added!','success'); render();
  } catch(err) { toast(err.message||'Failed to add expense','error'); }
  finally { setLoading(false); }
}

// ─── Settle ───────────────────────────────────────────────────────────────────
function settleDebt(fromId, toId, amount, groupId) {
  const from=getUser(fromId), to=getUser(toId);
  showModal(`
    <div class="modal-header">
      <div class="modal-title">Settle Up</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="text-align:center;padding:10px 0 20px">
        <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:12px">
          ${avatarHtml(fromId,48)}<div style="font-size:24px;color:var(--gray-400)">→</div>${avatarHtml(toId,48)}
        </div>
        <div style="font-size:15px;color:var(--gray-600)"><strong>${from?.name}</strong> pays <strong>${to?.name}</strong></div>
      </div>
      <div class="form-group">
        <label class="form-label">Amount</label>
        <input id="settle-amount" class="form-control" type="number" min="0.01" step="0.01" value="${amount.toFixed(2)}">
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input id="settle-date" class="form-control" type="date" value="${new Date().toISOString().split('T')[0]}">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="confirmSettle('${fromId}','${toId}','${groupId||''}')">Record Payment</button>
    </div>`);
}

async function confirmSettle(fromId, toId, groupId) {
  const amount=parseFloat(document.getElementById('settle-amount').value);
  const date=document.getElementById('settle-date').value;
  if(!amount||amount<=0){ toast('Enter a valid amount','error'); return; }
  setLoading(true);
  try {
    await dbCreateSettlement(fromId, toId, amount, groupId||null, date);
    await loadData();
    closeModal(); toast('Settlement recorded!','success'); render();
  } catch(err) { toast(err.message||'Failed to record settlement','error'); }
  finally { setLoading(false); }
}

// ─── Delete expense ───────────────────────────────────────────────────────────
function confirmDeleteExpense(expId) {
  showModal(`<div class="modal-header"><div class="modal-title">Delete Expense?</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><p style="color:var(--gray-600);font-size:14px">This expense will be permanently deleted and balances recalculated.</p></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="deleteExpense('${expId}')">Delete</button></div>`);
}

async function deleteExpense(expId) {
  setLoading(true);
  try {
    await dbDeleteExpense(expId);
    await loadData();
    closeModal(); toast('Expense deleted'); render();
  } catch(err) { toast(err.message||'Failed to delete','error'); }
  finally { setLoading(false); }
}

// ─── Delete group ─────────────────────────────────────────────────────────────
function confirmDeleteGroup(groupId) {
  showModal(`<div class="modal-header"><div class="modal-title">Delete Group?</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><p style="color:var(--gray-600);font-size:14px">This permanently deletes the group and all its expenses. Cannot be undone.</p></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="deleteGroup('${groupId}')">Delete Group</button></div>`);
}

async function deleteGroup(groupId) {
  setLoading(true);
  try {
    await dbDeleteGroup(groupId);
    await loadData();
    closeModal(); toast('Group deleted'); navigate('groups');
  } catch(err) { toast(err.message||'Failed to delete group','error'); }
  finally { setLoading(false); }
}

// ─── Edit profile ─────────────────────────────────────────────────────────────
function showEditProfileModal() {
  const me=getUser(state.currentUser);
  window._selProfileColor=me?.color||COLORS[0];
  showModal(`<div class="modal-header"><div class="modal-title">Edit Profile</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="text-align:center;margin-bottom:20px">${avatarHtml(state.currentUser,64)}</div>
      <div class="form-group">
        <label class="form-label">Your Name</label>
        <input id="profile-name" class="form-control" value="${me?.name||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Avatar Color</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${COLORS.map(c=>`<div onclick="selProfileColor(this,'${c}')" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===window._selProfileColor?'#1f2937':'transparent'};transition:border .15s" data-pcolor="${c}"></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveProfile()">Save</button>
    </div>`);
}

function selProfileColor(el, color) {
  window._selProfileColor=color;
  document.querySelectorAll('[data-pcolor]').forEach(b=>b.style.borderColor='transparent');
  el.style.borderColor='#1f2937';
}

async function saveProfile() {
  const name=document.getElementById('profile-name').value.trim();
  if(!name){ toast('Enter your name','error'); return; }
  setLoading(true);
  try {
    await dbUpdateProfile(name, window._selProfileColor||COLORS[0]);
    await loadData();
    closeModal(); toast('Profile updated!','success'); render();
  } catch(err) { toast(err.message||'Failed to update profile','error'); }
  finally { setLoading(false); }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function init() {
  setLoading(true);
  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (session) {
      await loadData();
      hideAuthPage();
      render();
    } else {
      showAuthPage('login');
    }
  } catch(err) {
    showAuthPage('login');
  } finally {
    setLoading(false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Listen for auth state changes (login / logout / token refresh)
  dbOnAuthChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      setLoading(true);
      await loadData();
      setLoading(false);
      hideAuthPage();
      render();
    } else if (event === 'SIGNED_OUT') {
      showAuthPage('login');
    }
  });
  init();
});
