document.addEventListener('DOMContentLoaded', () => {
  let currentEvents = [];
  let currentFilter = 'all';
  let currentSearchQuery = '';
  let searchDebounceTimeout = null;
  let conflictCheckTimeout = null;

  let sessionId = sessionStorage.getItem('assistant_session_id');
  if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem('assistant_session_id', sessionId);
  }

  const brandOrb = document.getElementById('brandOrb');
  const openCreateModalBtn = document.getElementById('openCreateModalBtn');
  const ttsToggleBtn = document.getElementById('ttsToggleBtn');
  const resetSessionBtn = document.getElementById('resetSessionBtn');

  const audioVisualizer = document.getElementById('audioVisualizer');
  const micBtn = document.getElementById('micBtn');
  const voiceStatus = document.getElementById('voiceStatus');
  const dialogueList = document.getElementById('dialogueList');
  const quickPrompts = document.getElementById('quickPrompts');
  const textInputForm = document.getElementById('textInputForm');
  const queryInput = document.getElementById('queryInput');

  const eventsCount = document.getElementById('eventsCount');
  const filterTabs = document.getElementById('filterTabs');
  const agendaSearchInput = document.getElementById('agendaSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const eventsList = document.getElementById('eventsList');

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

  const toastContainer = document.getElementById('toastContainer');

  const speech = new VoiceAssistantSpeech();
  speech.initVisualizer(audioVisualizer);

  updateTtsButtonState(speech.isTtsEnabled);

  speech.setCallbacks({
    onStatusChange: (status) => {
      if (status === 'listening') {
        voiceStatus.textContent = 'Слушаю вас...';
        voiceStatus.className = 'voice-status listening';
        micBtn.classList.add('listening');
        micBtn.classList.remove('processing');
      } else if (status === 'speaking') {
        voiceStatus.textContent = 'Ассистент отвечает...';
        voiceStatus.className = 'voice-status speaking';
        micBtn.classList.remove('listening', 'processing');
      } else {
        voiceStatus.textContent = 'Нажмите на микрофон или введите команду';
        voiceStatus.className = 'voice-status';
        micBtn.classList.remove('listening', 'processing');
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
        showToast('Голосовой ввод не поддерживается браузером', 'warning');
      } else if (err === 'not-allowed') {
        showToast('Доступ к микрофону запрещен', 'error');
      } else if (err !== 'no-speech') {
        showToast(`Ошибка: ${err}`, 'warning');
      }
    }
  });

  function showToast(message, type = 'info', duration = 3000) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else {
      iconSvg = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => toast.remove(), 200);
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

  async function sendMessage(text) {
    if (!text || !text.trim()) return;

    appendDialogueBubble(text, 'user');

    micBtn.classList.add('processing');
    voiceStatus.textContent = 'Обработка...';

    const loadingBubble = appendDialogueBubble('...', 'assistant');
    const loadingP = loadingBubble.querySelector('p');
    loadingP.innerHTML = '<span class="spinner" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Обработка...';

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
        throw new Error(`Статус: ${response.status}`);
      }

      const data = await response.json();
      const isConflict = data.action && data.action.action_type === 'CREATE_WITH_CONFLICT';
      loadingP.textContent = data.reply_text;
      if (isConflict) {
        loadingBubble.classList.add('conflict-bubble');
      }

      if (data.voice_text || data.reply_text) {
        speech.speak(data.voice_text || data.reply_text);
      }

      if (data.action) {
        const actionType = data.action.action_type;
        if (actionType === 'SEARCH' || actionType === 'LIST') {
          if (data.affected_events) {
            renderEvents(data.affected_events);
          } else {
            loadEvents();
          }
        } else {
          await loadEvents();
        }

        if (actionType === 'CREATE_WITH_CONFLICT') {
          showToast('Обнаружен конфликт по времени в расписании', 'warning');
        }
      }

      if (data.requires_clarification) {
        queryInput.focus();
      }

    } catch (err) {
      loadingP.textContent = 'Ошибка при обработке запроса.';
      showToast('Ошибка связи с сервером', 'error');
    } finally {
      micBtn.classList.remove('processing');
      if (!speech.isListening) {
        voiceStatus.textContent = 'Нажмите на микрофон или введите команду';
      }
    }
  }

  async function loadEvents() {
    try {
      let url = '/api/events?limit=300';
      if (currentFilter === 'completed') {
        url += '&is_completed=true';
      } else if (currentFilter !== 'all') {
        url += `&type=${encodeURIComponent(currentFilter)}`;
      }

      if (currentSearchQuery.trim()) {
        url = `/api/events/search?q=${encodeURIComponent(currentSearchQuery.trim())}&limit=50`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Ошибка загрузки');
      const events = await res.json();
      currentEvents = events;
      renderEvents(events);
    } catch (e) {
      eventsList.innerHTML = `
        <div class="events-empty">
          <p>Не удалось загрузить данные</p>
          <button class="btn btn-secondary" onclick="window.location.reload()">Обновить</button>
        </div>
      `;
    }
  }

  function renderEvents(events) {
    eventsCount.textContent = `${events.length} ${pluralizeEvents(events.length)}`;

    if (!events || events.length === 0) {
      eventsList.innerHTML = `
        <div class="events-empty">
          <p>Записей не найдено</p>
        </div>
      `;
      return;
    }

    eventsList.innerHTML = '';

    if (currentFilter === 'completed') {
      const completedEvents = events.filter(e => e.is_completed);
      renderEventItems(completedEvents);
      return;
    }

    if (currentFilter === 'all') {
      const active = events.filter(e => !e.is_completed);
      const completed = events.filter(e => e.is_completed);

      if (active.length > 0) {
        const header = document.createElement('div');
        header.className = 'events-section-header';
        header.innerHTML = `<span>В процессе</span><span class="badge">${active.length}</span>`;
        eventsList.appendChild(header);
        renderEventItems(active);
      }

      if (completed.length > 0) {
        const header = document.createElement('div');
        header.className = 'events-section-header';
        header.innerHTML = `<span>Выполненные</span><span class="badge">${completed.length}</span>`;
        eventsList.appendChild(header);
        renderEventItems(completed);
      }
      return;
    }

    renderEventItems(events);
  }

  function renderEventItems(items) {
    const sorted = [...items].sort((a, b) => {
      const dtA = (a.date || '') + ' ' + (a.time || '00:00');
      const dtB = (b.date || '') + ' ' + (b.time || '00:00');
      return dtA.localeCompare(dtB);
    });

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
          showToast(updated.is_completed ? 'Завершено' : 'Возвращено в работу', 'success');
          loadEvents();
        }
      } catch (err) {
        showToast('Ошибка обновления статуса', 'error');
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
    }, 250);
  });

  clearSearchBtn.addEventListener('click', () => {
    agendaSearchInput.value = '';
    clearSearchBtn.style.display = 'none';
    currentSearchQuery = '';
    loadEvents();
  });

  quickPrompts.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const promptText = chip.dataset.prompt;
    if (promptText) {
      sendMessage(promptText);
    }
  });

  textInputForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = queryInput.value.trim();
    if (text) {
      sendMessage(text);
      queryInput.value = '';
    }
  });

  micBtn.addEventListener('click', () => {
    speech.toggleListening();
  });

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

  ttsToggleBtn.addEventListener('click', () => {
    const enabled = speech.toggleTts();
    updateTtsButtonState(enabled);
    showToast(enabled ? 'Голос включен' : 'Голос выключен', 'info');
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
            <p>Диалог сброшен. Чем помочь?</p>
            <span class="bubble-time">Сейчас</span>
          </div>
        </div>
      `;
      showToast('Диалог сброшен', 'info');
    } catch (e) {
      showToast('Ошибка сброса диалога', 'error');
    }
  });

  function openModalForCreate() {
    modalTitle.textContent = 'Новая запись';
    formEventId.value = '';
    formTitle.value = '';
    formDescription.value = '';
    formAttendees.value = '';

    const today = new Date().toISOString().split('T')[0];
    formDate.value = today;
    formTime.value = '';

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
          conflictAlertText.textContent = `Внимание: в это время встреча «${conflicts[0].title}».`;
          formConflictAlert.style.display = 'flex';
        } else {
          hideConflictAlert();
        }
      }
    } catch (err) {
      hideConflictAlert();
    }
  }

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
      showToast('Укажите название и дату', 'warning');
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
        throw new Error('Ошибка сохранения');
      }

      closeEventModal();
      showToast(id ? 'Запись сохранена' : 'Запись добавлена', 'success');
      loadEvents();
    } catch (err) {
      showToast('Не удалось сохранить', 'error');
    }
  });

  loadEvents();
});
