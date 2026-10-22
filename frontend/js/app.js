/**
 * Main Application Logic for Voice Assistant & Agenda Feed
 */

document.addEventListener('DOMContentLoaded', () => {
  // ---------------- State & Variables ----------------
  let currentEvents = [];
  let currentFilter = 'all'; // all, meeting, task, reminder
  let currentSearchQuery = '';
  let searchDebounceTimeout = null;
  let conflictCheckTimeout = null;

  // Generate or retrieve persistent session ID
  let sessionId = sessionStorage.getItem('assistant_session_id');
  if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem('assistant_session_id', sessionId);
  }

  // ---------------- DOM References ----------------
  // Header
  const brandOrb = document.getElementById('brandOrb');
  const openCreateModalBtn = document.getElementById('openCreateModalBtn');
  const ttsToggleBtn = document.getElementById('ttsToggleBtn');
  const resetSessionBtn = document.getElementById('resetSessionBtn');

  // Assistant Pane
  const audioVisualizer = document.getElementById('audioVisualizer');
  const micBtn = document.getElementById('micBtn');
  const voiceStatus = document.getElementById('voiceStatus');
  const dialogueList = document.getElementById('dialogueList');
  const quickPrompts = document.getElementById('quickPrompts');
  const textInputForm = document.getElementById('textInputForm');
  const queryInput = document.getElementById('queryInput');

  // Agenda Pane
  const eventsCount = document.getElementById('eventsCount');
  const filterTabs = document.getElementById('filterTabs');
  const agendaSearchInput = document.getElementById('agendaSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const eventsList = document.getElementById('eventsList');

  // Modal
  const eventModal = document.getElementById('eventModal');
  const modalTitle = document.getElementById('modalTitle');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelModalBtn = document.getElementById('cancelModalBtn');
  const eventForm = document.getElementById('eventForm');
  const formEventId = document.getElementById('formEventId');
  const formTitle = document.getElementById('formTitle');
  const formDate = document.getElementById('formDate');
  const formTime = document.getElementById('formTime');
  const formConflictAlert = document.getElementById('formConflictAlert');
  const conflictAlertText = document.getElementById('conflictAlertText');
  const formAttendees = document.getElementById('formAttendees');
  const formDescription = document.getElementById('formDescription');

  // Toast
  const toastContainer = document.getElementById('toastContainer');

  // ---------------- Speech & Audio Init ----------------
  const speech = new VoiceAssistantSpeech();
  speech.initVisualizer(audioVisualizer);

  // Update initial TTS button state
  updateTtsButtonState(speech.isTtsEnabled);

  speech.setCallbacks({
    onStatusChange: (status) => {
      if (status === 'listening') {
        voiceStatus.textContent = 'Слушаю вас... Говорите';
        voiceStatus.className = 'voice-status listening';
        micBtn.classList.add('listening');
        micBtn.classList.remove('processing');
        brandOrb.classList.add('pulse');
      } else if (status === 'speaking') {
        voiceStatus.textContent = 'Ассистент отвечает...';
        voiceStatus.className = 'voice-status speaking';
        micBtn.classList.remove('listening', 'processing');
        brandOrb.classList.add('pulse');
      } else {
        voiceStatus.textContent = 'Нажмите на микрофон или скажите команду';
        voiceStatus.className = 'voice-status';
        micBtn.classList.remove('listening', 'processing');
        brandOrb.classList.remove('pulse');
      }
    },
    onResult: (text, isFinal) => {
      queryInput.value = text;
      if (isFinal && text.trim()) {
        sendMessage(text.trim());
        queryInput.value = '';
      }
    },
    onError: (err) => {
      if (err === 'not_supported') {
        showToast('Голосовой ввод не поддерживается браузером. Используйте Chrome или Edge.', 'warning');
      } else if (err === 'not-allowed') {
        showToast('Доступ к микрофону запрещен в настройках браузера.', 'error');
      } else if (err !== 'no-speech') {
        showToast(`Ошибка распознавания: ${err}`, 'warning');
      }
    }
  });

  // ---------------- Toast Helper ----------------
  function showToast(message, type = 'info', duration = 3500) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error' || type === 'warning') {
      iconSvg = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
      iconSvg = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  function updateTtsButtonState(enabled) {
    const textSpan = ttsToggleBtn.querySelector('.btn-text');
    if (enabled) {
      ttsToggleBtn.classList.add('active');
      if (textSpan) textSpan.textContent = 'Голос вкл';
    } else {
      ttsToggleBtn.classList.remove('active');
      if (textSpan) textSpan.textContent = 'Голос выкл';
    }
  }

  // ---------------- Dialogue History Management ----------------
  function appendDialogueBubble(text, sender = 'assistant', isConflict = false) {
    const bubble = document.createElement('div');
    bubble.className = `dialogue-bubble ${sender}-bubble ${isConflict ? 'conflict-bubble' : ''}`;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let avatarSvg = '';
    if (sender === 'assistant') {
      avatarSvg = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"></path>
          <path d="M18 10a6 6 0 0 1-12 0"></path>
          <rect x="5" y="14" width="14" height="8" rx="2"></rect>
          <circle cx="9" cy="18" r="1"></circle>
          <circle cx="15" cy="18" r="1"></circle>
        </svg>
      `;
    } else {
      avatarSvg = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      `;
    }

    bubble.innerHTML = `
      <div class="bubble-avatar">${avatarSvg}</div>
      <div class="bubble-content">
        <p>${escapeHtml(text)}</p>
        <span class="bubble-time">${timeStr}</span>
      </div>
    `;

    dialogueList.appendChild(bubble);
    dialogueList.scrollTop = dialogueList.scrollHeight;
    return bubble;
  }

  // ---------------- Assistant Communication ----------------
  async function sendMessage(text) {
    if (!text || !text.trim()) return;

    // Append user message
    appendDialogueBubble(text, 'user');

    // UI Loading state
    micBtn.classList.add('processing');
    voiceStatus.textContent = 'Думаю...';

    // Temporary loading placeholder
    const loadingBubble = appendDialogueBubble('...', 'assistant');
    const loadingP = loadingBubble.querySelector('p');
    loadingP.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Обработка запроса...';

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          session_id: sessionId
        })
      });

      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }

      const data = await response.json();

      // Replace loading bubble text
      const isConflict = data.action && data.action.action_type === 'CREATE_WITH_CONFLICT';
      loadingP.textContent = data.reply_text;
      if (isConflict) {
        loadingBubble.classList.add('conflict-bubble');
      }

      // Voice response
      if (data.voice_text || data.reply_text) {
        speech.speak(data.voice_text || data.reply_text);
      }

      // Handle assistant actions
      if (data.action) {
        const actionType = data.action.action_type;
        if (actionType === 'SEARCH' || actionType === 'LIST') {
          if (data.affected_events) {
            renderEvents(data.affected_events);
          } else {
            loadEvents();
          }
        } else {
          // CREATE, CREATE_WITH_CONFLICT, UPDATE, DELETE, COMPLETE
          await loadEvents();
          if (data.action.target_event_id) {
            highlightEventCard(data.action.target_event_id);
          }
        }

        if (actionType === 'CREATE_WITH_CONFLICT') {
          showToast('Внимание: обнаружен конфликт по времени в расписании!', 'warning', 5000);
        }
      }

      if (data.requires_clarification) {
        queryInput.focus();
      }

    } catch (err) {
      console.error('Chat error:', err);
      loadingP.textContent = 'Произошла ошибка при связи с ассистентом. Попробуйте еще раз.';
      showToast('Не удалось получить ответ ассистента', 'error');
    } finally {
      micBtn.classList.remove('processing');
      if (!speech.isListening) {
        voiceStatus.textContent = 'Нажмите на микрофон или скажите команду';
      }
    }
  }

  // ---------------- Agenda & Events API ----------------
  async function loadEvents() {
    try {
      let url = '/api/events?limit=200';
      if (currentFilter !== 'all') {
        url += `&type=${encodeURIComponent(currentFilter)}`;
      }
      if (currentSearchQuery.trim()) {
        url = `/api/events/search?q=${encodeURIComponent(currentSearchQuery.trim())}&limit=50`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Ошибка загрузки событий');
      const events = await res.json();
      currentEvents = events;
      renderEvents(events);
    } catch (e) {
      console.error('Failed to load events:', e);
      eventsList.innerHTML = `
        <div class="events-empty">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;color:#fb7185;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Не удалось загрузить расписание</span>
          <button class="btn btn-secondary" onclick="window.location.reload()">Обновить страницу</button>
        </div>
      `;
    }
  }

  function renderEvents(events) {
    eventsCount.textContent = `${events.length} ${pluralizeEvents(events.length)}`;

    if (!events || events.length === 0) {
      eventsList.innerHTML = `
        <div class="events-empty">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:40px;height:40px;color:var(--text-muted);">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <p>Записей не найдено</p>
          <span style="font-size:0.8rem;color:var(--text-muted);">Скажите ассистенту команду или нажмите «Новая запись»</span>
        </div>
      `;
      return;
    }

    // Sort: uncompleted first, then by date and time
    const sorted = [...events].sort((a, b) => {
      if (a.is_completed !== b.is_completed) {
        return a.is_completed ? 1 : -1;
      }
      const dtA = (a.date || '') + ' ' + (a.time || '00:00');
      const dtB = (b.date || '') + ' ' + (b.time || '00:00');
      return dtA.localeCompare(dtB);
    });

    eventsList.innerHTML = '';
    sorted.forEach(ev => {
      const card = createEventCardElement(ev);
      eventsList.appendChild(card);
    });
  }

  function createEventCardElement(ev) {
    const card = document.createElement('div');
    card.className = `event-card type-${ev.type} ${ev.is_completed ? 'completed' : ''}`;
    card.id = `eventCard-${ev.id}`;

    const typeTitle = ev.type === 'meeting' ? 'Встреча' : (ev.type === 'reminder' ? 'Напоминание' : 'Задача');
    const formattedDate = formatCardDate(ev.date);
    const isToday = isDateToday(ev.date);

    card.innerHTML = `
      <button class="event-check-btn" title="${ev.is_completed ? 'Вернуть в активные' : 'Отметить выполненным'}" data-action="toggle" data-id="${ev.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </button>

      <div class="event-info">
        <div class="event-top-line">
          <span class="event-type-badge type-${ev.type}">${typeTitle}</span>
          <span class="event-title" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</span>
        </div>
        ${ev.description ? `<p class="event-desc" title="${escapeHtml(ev.description)}">${escapeHtml(ev.description)}</p>` : ''}
        <div class="event-meta">
          <div class="meta-item ${isToday ? 'is-today' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span>${formattedDate}</span>
          </div>

          ${ev.time ? `
            <div class="meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>${escapeHtml(ev.time)}</span>
            </div>
          ` : ''}

          ${ev.attendees ? `
            <div class="meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              <span>${escapeHtml(ev.attendees)}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="event-actions">
        <button class="card-action-btn edit-btn" title="Редактировать" data-action="edit" data-id="${ev.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="card-action-btn delete-btn" title="Удалить" data-action="delete" data-id="${ev.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    return card;
  }

  function highlightEventCard(id) {
    const card = document.getElementById(`eventCard-${id}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      card.classList.add('just-added');
      setTimeout(() => card.classList.remove('just-added'), 3000);
    }
  }

  // Event Delegated Actions (Toggle, Edit, Delete)
  eventsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id, 10);
    if (!id) return;

    if (action === 'toggle') {
      try {
        const res = await fetch(`/api/events/${id}/toggle`, { method: 'POST' });
        if (res.ok) {
          const updated = await res.json();
          showToast(`«${updated.title}» ${updated.is_completed ? 'выполнена' : 'возвращена в работу'}`, 'success');
          loadEvents();
        }
      } catch (err) {
        showToast('Не удалось обновить статус', 'error');
      }
    } else if (action === 'edit') {
      const ev = currentEvents.find(item => item.id === id);
      if (ev) {
        openModalForEdit(ev);
      }
    } else if (action === 'delete') {
      if (confirm('Удалить эту запись?')) {
        try {
          const res = await fetch(`/api/events/${id}`, { method: 'DELETE' });
          if (res.ok) {
            showToast('Запись удалена', 'info');
            loadEvents();
          }
        } catch (err) {
          showToast('Ошибка при удалении', 'error');
        }
      }
    }
  });

  // Date Formatting Helpers
  function formatCardDate(dateStr) {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const target = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const diffTime = target.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

      if (diffDays === 0) return 'Сегодня';
      if (diffDays === 1) return 'Завтра';
      if (diffDays === -1) return 'Вчера';

      const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      return `${day} ${months[month - 1]}`;
    } catch (e) {
      return dateStr;
    }
  }

  function isDateToday(dateStr) {
    if (!dateStr) return false;
    const today = new Date().toISOString().split('T')[0];
    return dateStr === today;
  }

  function pluralizeEvents(n) {
    const abs = Math.abs(n) % 100;
    const num = abs % 10;
    if (abs > 10 && abs < 20) return 'записей';
    if (num > 1 && num < 5) return 'записи';
    if (num === 1) return 'запись';
    return 'записей';
  }

  // ---------------- Filters & Search ----------------
  filterTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab-btn');
    if (!tab) return;
    filterTabs.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter || 'all';
    loadEvents();
  });

  agendaSearchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    clearSearchBtn.style.display = val ? 'block' : 'none';
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
      currentSearchQuery = val;
      loadEvents();
    }, 280);
  });

  clearSearchBtn.addEventListener('click', () => {
    agendaSearchInput.value = '';
    clearSearchBtn.style.display = 'none';
    currentSearchQuery = '';
    loadEvents();
  });

  // ---------------- Quick Prompts ----------------
  quickPrompts.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const promptText = chip.dataset.prompt;
    if (promptText) {
      sendMessage(promptText);
    }
  });

  // ---------------- Input Form Submission ----------------
  textInputForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = queryInput.value.trim();
    if (text) {
      sendMessage(text);
      queryInput.value = '';
    }
  });

  // ---------------- Microphone Button & Hotkeys ----------------
  micBtn.addEventListener('click', () => {
    speech.toggleListening();
  });

  // Hotkey: Space bar Push-to-Talk (when not inside inputs)
  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    if (e.code === 'Space' && !isInputActive && !e.repeat) {
      e.preventDefault();
      if (!speech.isListening) {
        speech.startListening();
      }
    } else if (e.code === 'Escape') {
      closeEventModal();
    }
  });

  window.addEventListener('keyup', (e) => {
    const activeEl = document.activeElement;
    const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    if (e.code === 'Space' && !isInputActive && speech.isListening) {
      e.preventDefault();
      speech.stopListening();
    }
  });

  // ---------------- Header Buttons ----------------
  ttsToggleBtn.addEventListener('click', () => {
    const enabled = speech.toggleTts();
    updateTtsButtonState(enabled);
    showToast(enabled ? 'Голосовые ответы включены' : 'Голосовые ответы выключены', 'info');
  });

  resetSessionBtn.addEventListener('click', async () => {
    try {
      await fetch(`/api/assistant/reset-session?session_id=${encodeURIComponent(sessionId)}`, { method: 'POST' });
      sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem('assistant_session_id', sessionId);

      dialogueList.innerHTML = `
        <div class="dialogue-bubble assistant-bubble">
          <div class="bubble-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"></path>
              <path d="M18 10a6 6 0 0 1-12 0"></path>
              <rect x="5" y="14" width="14" height="8" rx="2"></rect>
              <circle cx="9" cy="18" r="1"></circle>
              <circle cx="15" cy="18" r="1"></circle>
            </svg>
          </div>
          <div class="bubble-content">
            <p>Контекст диалога сброшен. Чем я могу помочь?</p>
            <span class="bubble-time">Сейчас</span>
          </div>
        </div>
      `;
      showToast('Контекст ассистента успешно сброшен', 'info');
    } catch (e) {
      showToast('Не удалось сбросить контекст', 'error');
    }
  });

  // ---------------- Modal Create / Edit ----------------
  function openModalForCreate() {
    modalTitle.textContent = 'Новая запись';
    formEventId.value = '';
    formTitle.value = '';
    formDescription.value = '';
    formAttendees.value = '';

    // Default date: today
    const today = new Date().toISOString().split('T')[0];
    formDate.value = today;
    formTime.value = '';

    // Default type: task
    const taskRadio = eventForm.querySelector('input[name="eventType"][value="task"]');
    if (taskRadio) taskRadio.checked = true;

    hideConflictAlert();
    eventModal.style.display = 'flex';
    formTitle.focus();
  }

  function openModalForEdit(ev) {
    modalTitle.textContent = 'Редактировать запись';
    formEventId.value = ev.id;
    formTitle.value = ev.title;
    formDate.value = ev.date;
    formTime.value = ev.time || '';
    formAttendees.value = ev.attendees || '';
    formDescription.value = ev.description || '';

    const typeRadio = eventForm.querySelector(`input[name="eventType"][value="${ev.type}"]`);
    if (typeRadio) typeRadio.checked = true;

    hideConflictAlert();
    eventModal.style.display = 'flex';
    formTitle.focus();

    // Check conflict on opening if meeting with time
    if (ev.type === 'meeting' && ev.date && ev.time) {
      checkModalConflict(ev.date, ev.time, ev.id);
    }
  }

  function closeEventModal() {
    eventModal.style.display = 'none';
    hideConflictAlert();
  }

  function hideConflictAlert() {
    formConflictAlert.style.display = 'none';
  }

  // Conflict live checking
  async function checkModalConflict(dateVal, timeVal, excludeId = null) {
    if (!dateVal || !timeVal) {
      hideConflictAlert();
      return;
    }
    const typeRadio = eventForm.querySelector('input[name="eventType"]:checked');
    if (!typeRadio || typeRadio.value !== 'meeting') {
      hideConflictAlert();
      return;
    }

    try {
      let url = `/api/events/conflicts?date=${encodeURIComponent(dateVal)}&time=${encodeURIComponent(timeVal)}`;
      if (excludeId) url += `&exclude_id=${excludeId}`;

      const res = await fetch(url);
      if (res.ok) {
        const conflicts = await res.json();
        if (conflicts && conflicts.length > 0) {
          conflictAlertText.textContent = `Внимание: в это время уже запланирована встреча «${conflicts[0].title}»!`;
          formConflictAlert.style.display = 'flex';
        } else {
          hideConflictAlert();
        }
      }
    } catch (err) {
      hideConflictAlert();
    }
  }

  // Listeners for live conflict check
  function triggerConflictCheck() {
    clearTimeout(conflictCheckTimeout);
    conflictCheckTimeout = setTimeout(() => {
      const excludeId = formEventId.value ? parseInt(formEventId.value, 10) : null;
      checkModalConflict(formDate.value, formTime.value, excludeId);
    }, 200);
  }

  formDate.addEventListener('change', triggerConflictCheck);
  formTime.addEventListener('input', triggerConflictCheck);
  eventForm.querySelectorAll('input[name="eventType"]').forEach(radio => {
    radio.addEventListener('change', triggerConflictCheck);
  });

  openCreateModalBtn.addEventListener('click', openModalForCreate);
  closeModalBtn.addEventListener('click', closeEventModal);
  cancelModalBtn.addEventListener('click', closeEventModal);

  eventModal.addEventListener('click', (e) => {
    if (e.target === eventModal) {
      closeEventModal();
    }
  });

  // Submit Modal Form
  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = formEventId.value ? parseInt(formEventId.value, 10) : null;
    const type = eventForm.querySelector('input[name="eventType"]:checked').value;
    const title = formTitle.value.trim();
    const dateVal = formDate.value;
    const timeVal = formTime.value || null;
    const attendees = formAttendees.value.trim() || null;
    const description = formDescription.value.trim() || null;

    if (!title || !dateVal) {
      showToast('Заполните обязательные поля: название и дату', 'warning');
      return;
    }

    const payload = {
      type,
      title,
      date: dateVal,
      time: timeVal,
      attendees,
      description
    };

    try {
      let res;
      if (id) {
        res = await fetch(`/api/events/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        throw new Error('Ошибка при сохранении события');
      }

      const saved = await res.json();
      closeEventModal();
      showToast(id ? 'Запись обновлена' : 'Новая запись создана', 'success');
      await loadEvents();
      highlightEventCard(saved.id);
    } catch (err) {
      console.error('Error saving event:', err);
      showToast('Не удалось сохранить запись', 'error');
    }
  });

  // ---------------- Initial Load ----------------
  loadEvents();
});
