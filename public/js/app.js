// ===== SUPABASE INIT =====
const SUPABASE_URL = 'https://fpbfeynxviamquqvftzc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwYmZleW54dmlhbXF1cXZmdHpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzYyNzYsImV4cCI6MjA4NzUxMjI3Nn0.BNvslR1dCcEBfYbY-0w-uYSy82zkTJxlJi12B1yNPzc';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== GLOBAL STATE =====
let currentUser = null;
let currentPage = 'login';
let viewingComplaintId = null;

// ===== AUTH =====
function fillDemo(email, password) {
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginPassword').value = password;
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Signing in...';
  errorDiv.classList.add('d-none');

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, phone, role')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error || !data) {
      errorDiv.textContent = 'Invalid email or password';
      errorDiv.classList.remove('d-none');
      return;
    }

    currentUser = data;
    localStorage.setItem('civicUser', JSON.stringify(currentUser));
    setupNavigation();
    if (currentUser.role === 'admin') {
      showPage('adminDashboard');
    } else {
      showPage('citizenDashboard');
    }
  } catch (err) {
    errorDiv.textContent = 'Connection failed. Please try again.';
    errorDiv.classList.remove('d-none');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Sign In';
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('civicUser');
  document.getElementById('mainNav').style.display = 'none';
  document.querySelectorAll('.page').forEach(p => p.classList.add('d-none'));
  document.getElementById('loginPage').style.display = '';
  currentPage = 'login';
}

function setupNavigation() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('mainNav').style.display = '';
  document.getElementById('navUserName').innerHTML = `<i class="bi bi-person-circle"></i> ${currentUser.name}`;

  const navLinks = document.getElementById('navLinks');
  if (currentUser.role === 'admin') {
    navLinks.innerHTML = `
      <li class="nav-item"><a class="nav-link" href="#" onclick="showPage('adminDashboard')"><i class="bi bi-speedometer2"></i> Dashboard</a></li>
    `;
  } else {
    navLinks.innerHTML = `
      <li class="nav-item"><a class="nav-link" href="#" onclick="showPage('citizenDashboard')"><i class="bi bi-house"></i> My Complaints</a></li>
      <li class="nav-item"><a class="nav-link" href="#" onclick="showPage('newComplaint')"><i class="bi bi-plus-circle"></i> New Complaint</a></li>
    `;
  }
}

// ===== PAGE NAVIGATION =====
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('d-none'));
  document.getElementById(pageId).classList.remove('d-none');
  currentPage = pageId;

  if (pageId === 'citizenDashboard') loadCitizenComplaints();
  if (pageId === 'adminDashboard') loadAdminDashboard();
  if (pageId === 'newComplaint') resetComplaintForm();
}

function goBack() {
  if (currentUser.role === 'admin') showPage('adminDashboard');
  else showPage('citizenDashboard');
}

// ===== TOAST =====
function showToast(message) {
  document.getElementById('toastMessage').textContent = message;
  const toast = new bootstrap.Toast(document.getElementById('toastNotif'));
  toast.show();
}

// ===== HELPERS =====
function getStatusBadge(status) {
  const map = {
    'Submitted': 'badge-submitted',
    'Acknowledged': 'badge-acknowledged',
    'In Progress': 'badge-inprogress',
    'Resolved': 'badge-resolved',
    'Rejected': 'badge-rejected'
  };
  return `<span class="badge ${map[status] || 'bg-secondary'} px-3 py-2">${status}</span>`;
}

function getPriorityBadge(priority) {
  const map = {
    'Low': 'badge-low',
    'Medium': 'badge-medium',
    'High': 'badge-high',
    'Urgent': 'badge-urgent'
  };
  return `<span class="badge ${map[priority] || 'bg-secondary'} px-2 py-1">${priority}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ===== CITIZEN DASHBOARD =====
async function loadCitizenComplaints() {
  try {
    // Fetch all complaints for this citizen
    const { data: allComplaints, error } = await supabase
      .from('complaints')
      .select('*, users!complaints_user_id_fkey(name)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Map citizen_name from join
    let complaints = (allComplaints || []).map(c => ({
      ...c,
      citizen_name: c.users?.name || ''
    }));

    // Client-side filtering
    const search = document.getElementById('citizenSearch')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('citizenStatusFilter')?.value || 'all';

    let filtered = [...complaints];
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    if (search) {
      filtered = filtered.filter(c =>
        c.title.toLowerCase().includes(search) ||
        c.complaint_id.toLowerCase().includes(search) ||
        c.location.toLowerCase().includes(search)
      );
    }

    // Stats
    const stats = {
      total: complaints.length,
      submitted: complaints.filter(c => c.status === 'Submitted' || c.status === 'Acknowledged').length,
      inProgress: complaints.filter(c => c.status === 'In Progress').length,
      resolved: complaints.filter(c => c.status === 'Resolved').length
    };

    document.getElementById('citizenStats').innerHTML = `
      <div class="col-6 col-md-3">
        <div class="card stat-card shadow-sm">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="stat-icon bg-blue"><i class="bi bi-clipboard-data"></i></div>
            <div><div class="stat-number">${stats.total}</div><div class="stat-label">Total</div></div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card stat-card shadow-sm">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="stat-icon bg-orange"><i class="bi bi-hourglass-split"></i></div>
            <div><div class="stat-number">${stats.submitted}</div><div class="stat-label">Pending</div></div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card stat-card shadow-sm">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="stat-icon bg-purple"><i class="bi bi-arrow-repeat"></i></div>
            <div><div class="stat-number">${stats.inProgress}</div><div class="stat-label">In Progress</div></div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card stat-card shadow-sm">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="stat-icon bg-green"><i class="bi bi-check-circle"></i></div>
            <div><div class="stat-number">${stats.resolved}</div><div class="stat-label">Resolved</div></div>
          </div>
        </div>
      </div>
    `;

    // Table
    const tbody = document.getElementById('citizenComplaintsList');
    const noData = document.getElementById('citizenNoData');

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      noData.classList.remove('d-none');
      return;
    }

    noData.classList.add('d-none');
    tbody.innerHTML = filtered.map(c => `
      <tr onclick="viewComplaint(${c.id})">
        <td><code>${c.complaint_id}</code></td>
        <td><div class="complaint-title">${c.title}</div></td>
        <td><small>${c.category}</small></td>
        <td>${getStatusBadge(c.status)}</td>
        <td><small>${formatDate(c.created_at)}</small></td>
        <td><button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); viewComplaint(${c.id})"><i class="bi bi-eye"></i></button></td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Error loading complaints:', err);
    showToast('Failed to load complaints');
  }
}

// ===== ADMIN DASHBOARD =====
async function loadAdminDashboard() {
  try {
    // Load all complaints for stats
    const { data: all, error } = await supabase.from('complaints').select('status, category');
    if (error) throw error;

    const stats = {
      total: all.length,
      submitted: all.filter(c => c.status === 'Submitted').length,
      acknowledged: all.filter(c => c.status === 'Acknowledged').length,
      inProgress: all.filter(c => c.status === 'In Progress').length,
      resolved: all.filter(c => c.status === 'Resolved').length,
      rejected: all.filter(c => c.status === 'Rejected').length
    };

    document.getElementById('adminStats').innerHTML = `
      <div class="col-6 col-lg-2">
        <div class="card stat-card shadow-sm">
          <div class="card-body text-center p-3">
            <div class="stat-icon bg-blue mx-auto mb-2"><i class="bi bi-clipboard-data"></i></div>
            <div class="stat-number">${stats.total}</div>
            <div class="stat-label">Total</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-lg-2">
        <div class="card stat-card shadow-sm">
          <div class="card-body text-center p-3">
            <div class="stat-icon bg-orange mx-auto mb-2"><i class="bi bi-envelope-exclamation"></i></div>
            <div class="stat-number">${stats.submitted}</div>
            <div class="stat-label">Submitted</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-lg-2">
        <div class="card stat-card shadow-sm">
          <div class="card-body text-center p-3">
            <div class="stat-icon bg-cyan mx-auto mb-2"><i class="bi bi-eye"></i></div>
            <div class="stat-number">${stats.acknowledged}</div>
            <div class="stat-label">Acknowledged</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-lg-2">
        <div class="card stat-card shadow-sm">
          <div class="card-body text-center p-3">
            <div class="stat-icon bg-purple mx-auto mb-2"><i class="bi bi-arrow-repeat"></i></div>
            <div class="stat-number">${stats.inProgress}</div>
            <div class="stat-label">In Progress</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-lg-2">
        <div class="card stat-card shadow-sm">
          <div class="card-body text-center p-3">
            <div class="stat-icon bg-green mx-auto mb-2"><i class="bi bi-check-circle"></i></div>
            <div class="stat-number">${stats.resolved}</div>
            <div class="stat-label">Resolved</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-lg-2">
        <div class="card stat-card shadow-sm">
          <div class="card-body text-center p-3">
            <div class="stat-icon bg-red mx-auto mb-2"><i class="bi bi-x-circle"></i></div>
            <div class="stat-number">${stats.rejected}</div>
            <div class="stat-label">Rejected</div>
          </div>
        </div>
      </div>
    `;

    loadAdminComplaints();
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
    showToast('Failed to load dashboard');
  }
}

async function loadAdminComplaints() {
  try {
    const search = document.getElementById('adminSearch')?.value || '';
    const status = document.getElementById('adminStatusFilter')?.value || 'all';
    const category = document.getElementById('adminCategoryFilter')?.value || 'all';

    let query = supabase
      .from('complaints')
      .select('*, users!complaints_user_id_fkey(name)')
      .order('created_at', { ascending: false });

    if (status !== 'all') query = query.eq('status', status);
    if (category !== 'all') query = query.eq('category', category);
    if (search) {
      query = query.or(`title.ilike.%${search}%,complaint_id.ilike.%${search}%,location.ilike.%${search}%`);
    }

    const { data: complaints, error } = await query;
    if (error) throw error;

    const mapped = (complaints || []).map(c => ({
      ...c,
      citizen_name: c.users?.name || ''
    }));

    const tbody = document.getElementById('adminComplaintsList');
    const noData = document.getElementById('adminNoData');

    if (mapped.length === 0) {
      tbody.innerHTML = '';
      noData.classList.remove('d-none');
      return;
    }

    noData.classList.add('d-none');
    tbody.innerHTML = mapped.map(c => `
      <tr onclick="viewComplaint(${c.id})">
        <td><code>${c.complaint_id}</code></td>
        <td><div class="complaint-title">${c.title}</div></td>
        <td><small>${c.citizen_name}</small></td>
        <td><small>${c.category}</small></td>
        <td>${getPriorityBadge(c.priority)}</td>
        <td>${getStatusBadge(c.status)}</td>
        <td><small>${formatDate(c.created_at)}</small></td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); viewComplaint(${c.id})">
            <i class="bi bi-eye"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading admin complaints:', err);
  }
}

// ===== NEW COMPLAINT =====
function resetComplaintForm() {
  document.getElementById('complaintForm').reset();
  document.getElementById('complaintSuccess').classList.add('d-none');
  document.getElementById('imagePreview').innerHTML = '';
  document.getElementById('charCount').textContent = '0';
}

function clearForm() {
  resetComplaintForm();
}

// Character counter
document.addEventListener('DOMContentLoaded', () => {
  const desc = document.getElementById('compDescription');
  if (desc) {
    desc.addEventListener('input', () => {
      document.getElementById('charCount').textContent = desc.value.length;
    });
  }

  // Image preview
  const imgInput = document.getElementById('compImage');
  if (imgInput) {
    imgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      const preview = document.getElementById('imagePreview');
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          preview.innerHTML = `<img src="${ev.target.result}" class="img-thumbnail" style="max-height:150px;">`;
        };
        reader.readAsDataURL(file);
      } else {
        preview.innerHTML = '';
      }
    });
  }

  // Check for saved user
  const saved = localStorage.getItem('civicUser');
  if (saved) {
    currentUser = JSON.parse(saved);
    setupNavigation();
    if (currentUser.role === 'admin') showPage('adminDashboard');
    else showPage('citizenDashboard');
  }
});

async function submitComplaint(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Submitting...';

  try {
    // Generate complaint ID via Supabase RPC
    const { data: cid, error: cidErr } = await supabase.rpc('get_next_complaint_id');
    if (cidErr) throw cidErr;

    const complaintData = {
      complaint_id: cid,
      title: document.getElementById('compTitle').value,
      category: document.getElementById('compCategory').value,
      description: document.getElementById('compDescription').value,
      location: document.getElementById('compLocation').value,
      priority: document.getElementById('compPriority').value || 'Medium',
      user_id: currentUser.id,
      image_path: null
    };

    // Insert complaint
    const { data: inserted, error: insErr } = await supabase
      .from('complaints')
      .insert(complaintData)
      .select()
      .single();

    if (insErr) throw insErr;

    // Add initial comment
    await supabase.from('comments').insert({
      complaint_id: inserted.id,
      user_id: currentUser.id,
      message: 'Complaint submitted successfully.'
    });

    const successDiv = document.getElementById('complaintSuccess');
    document.getElementById('successMessage').innerHTML =
      `Complaint submitted! Your tracking ID is <strong>${cid}</strong>`;
    successDiv.classList.remove('d-none');

    document.getElementById('complaintForm').reset();
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('charCount').textContent = '0';

    showToast(`Complaint ${cid} submitted successfully!`);
  } catch (err) {
    console.error('Error submitting complaint:', err);
    showToast('Failed to submit complaint. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send"></i> Submit Complaint';
  }
}

// ===== COMPLAINT DETAILS =====
async function viewComplaint(id) {
  viewingComplaintId = id;
  showPage('complaintDetails');

  try {
    // Fetch complaint with citizen info
    const { data: c, error: cErr } = await supabase
      .from('complaints')
      .select('*, users!complaints_user_id_fkey(name, email, phone)')
      .eq('id', id)
      .single();

    if (cErr) throw cErr;

    // Fetch comments with user info
    const { data: comments, error: cmErr } = await supabase
      .from('comments')
      .select('*, users(name, role)')
      .eq('complaint_id', id)
      .order('created_at', { ascending: true });

    if (cmErr) throw cmErr;

    document.getElementById('detailComplaintId').textContent = c.complaint_id;
    document.getElementById('detailTitle').textContent = c.title;
    document.getElementById('detailDescription').textContent = c.description;
    document.getElementById('detailCategory').textContent = c.category;
    document.getElementById('detailPriority').innerHTML = getPriorityBadge(c.priority);
    document.getElementById('detailLocation').textContent = c.location;
    document.getElementById('detailDate').textContent = formatDateTime(c.created_at);
    document.getElementById('detailCitizen').textContent = `${c.users?.name || ''} (${c.users?.email || ''})`;
    document.getElementById('detailStatusBadge').innerHTML = getStatusBadge(c.status);

    // Resolved date
    if (c.resolved_at) {
      document.getElementById('detailResolvedDateWrap').style.display = '';
      document.getElementById('detailResolvedDate').textContent = formatDateTime(c.resolved_at);
    } else {
      document.getElementById('detailResolvedDateWrap').style.display = 'none';
    }

    // Image
    if (c.image_path) {
      document.getElementById('detailImageWrap').style.display = '';
      document.getElementById('detailImage').src = c.image_path;
    } else {
      document.getElementById('detailImageWrap').style.display = 'none';
    }

    // Admin actions
    if (currentUser.role === 'admin') {
      document.getElementById('adminActionsCard').style.display = '';
      document.getElementById('statusSelect').value = c.status;
    } else {
      document.getElementById('adminActionsCard').style.display = 'none';
    }

    // Comments timeline
    const mappedComments = (comments || []).map(cm => ({
      ...cm,
      user_name: cm.users?.name || '',
      user_role: cm.users?.role || 'citizen'
    }));
    renderTimeline(mappedComments);

    // Status progress
    renderStatusProgress(c.status);

  } catch (err) {
    console.error('Error loading complaint:', err);
    showToast('Failed to load complaint details');
  }
}

function renderTimeline(comments) {
  const container = document.getElementById('commentsTimeline');
  if (comments.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">No activity yet</p>';
    return;
  }

  container.innerHTML = comments.map(cm => `
    <div class="timeline-item">
      <div class="timeline-dot ${cm.user_role === 'admin' ? 'dot-admin' : ''}"></div>
      <div class="timeline-content">
        <div class="d-flex justify-content-between align-items-center">
          <span class="timeline-user">
            ${cm.user_role === 'admin' ? '<i class="bi bi-shield-check text-primary me-1"></i>' : '<i class="bi bi-person me-1"></i>'}
            ${cm.user_name}
          </span>
          <span class="timeline-time">${formatDateTime(cm.created_at)}</span>
        </div>
        <div class="timeline-message">${cm.message}</div>
      </div>
    </div>
  `).join('');
}

function renderStatusProgress(currentStatus) {
  const steps = ['Submitted', 'Acknowledged', 'In Progress', 'Resolved'];
  const currentIdx = steps.indexOf(currentStatus);
  const isRejected = currentStatus === 'Rejected';

  let html = '';
  steps.forEach((step, i) => {
    let cls = '';
    if (isRejected && i === 0) cls = 'completed';
    else if (i < currentIdx) cls = 'completed';
    else if (i === currentIdx) cls = 'active';

    const icon = cls === 'completed' ? '<i class="bi bi-check"></i>' : (i + 1);

    html += `
      <div class="status-step ${cls}">
        <div class="step-circle">${icon}</div>
        <div>
          <div class="step-label">${step}</div>
        </div>
      </div>
    `;
  });

  if (isRejected) {
    html += `
      <div class="status-step active">
        <div class="step-circle" style="background:#dc3545;color:#fff;"><i class="bi bi-x"></i></div>
        <div><div class="step-label text-danger">Rejected</div></div>
      </div>
    `;
  }

  document.getElementById('statusProgress').innerHTML = html;
}

// ===== ADMIN ACTIONS =====
async function updateStatus() {
  const status = document.getElementById('statusSelect').value;
  const comment = document.getElementById('statusComment').value;

  try {
    const now = new Date().toISOString();
    const updateData = { status, updated_at: now };
    if (status === 'Resolved') updateData.resolved_at = now;

    const { error: updErr } = await supabase
      .from('complaints')
      .update(updateData)
      .eq('id', viewingComplaintId);

    if (updErr) throw updErr;

    // Add status change comment
    const msg = comment || `Status changed to "${status}"`;
    await supabase.from('comments').insert({
      complaint_id: viewingComplaintId,
      user_id: currentUser.id,
      message: msg
    });

    showToast(`Status updated to "${status}"`);
    document.getElementById('statusComment').value = '';
    viewComplaint(viewingComplaintId);
  } catch (err) {
    console.error('Error updating status:', err);
    showToast('Failed to update status');
  }
}

async function deleteComplaint() {
  if (!confirm('Are you sure you want to delete this complaint? This action cannot be undone.')) return;

  try {
    // Comments deleted automatically via ON DELETE CASCADE
    const { error } = await supabase
      .from('complaints')
      .delete()
      .eq('id', viewingComplaintId);

    if (error) throw error;

    showToast('Complaint deleted successfully');
    showPage('adminDashboard');
  } catch (err) {
    console.error('Error deleting complaint:', err);
    showToast('Failed to delete complaint');
  }
}

async function addComment(e) {
  e.preventDefault();
  const message = document.getElementById('commentInput').value.trim();
  if (!message) return;

  try {
    const { error: cmErr } = await supabase.from('comments').insert({
      complaint_id: viewingComplaintId,
      user_id: currentUser.id,
      message
    });
    if (cmErr) throw cmErr;

    // Update complaint timestamp
    await supabase
      .from('complaints')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', viewingComplaintId);

    document.getElementById('commentInput').value = '';
    viewComplaint(viewingComplaintId);
    showToast('Comment added');
  } catch (err) {
    console.error('Error adding comment:', err);
    showToast('Failed to add comment');
  }
}
