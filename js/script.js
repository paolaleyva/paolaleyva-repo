/**
 * script.js - Claro
 * A personal brain manager: to-do list, notes, and Google Calendar integration.
 * 
 * Structure: 
 *  - CONFIG : app-level contraints
 *  - Task class : models a single to-do item
 *  - Note class : models the notes content
 *  - CalendarEvent : models a google Calendar event
 *  - TaskManager : manager task CRUD + localStorage persistence
 *  
 *  - NoteManager : manages notes + localStorage persistance 
 *  - CalendarManager : handles Google OAuth + Calendar API fetching
 *  
 *  - UIController : wires everything to the DOM
 *  - App Unit : bootstraps on DOMContent Loaded
 */

'use strict';

// CONFIG //

const CONFIG = {
    CLIENT_ID: '52474824105-iha7rce6ala5gakbpl1dme554cbu21k0.apps.googleusercontent.com', 
    SCOPES: 'https://www.googleapis.com/auth/calendar.readonly',
    STORAGE_KEYS: {
        TASKS: 'claro_tasks',
        NOTES: 'claro_notes',
        USER:  'claro_user',
    },
    // How many days ahead to fetch calendar events
    DAYS_AHEAD: 7,
};

// Task - represents a single to-do item //

class Task {
    /**
     * @param {string} text  - the task description
     * @param {string} [id]  - optional id (used when restoring from storage)
     * @param {boolean} [done] - completion state
     */
    constructor(text, id = null, done = false) {
        this.id   = id   || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        this.text = text.trim();
        this.done = done;
        this.createdAt = Date.now();
    }
    
    /** Toggle completion state */
    toggle() {
        this.done = !this.done;
    }
    
    /** Serialize to a plain object for JSON storage */
    toJSON() {
        return { id: this.id, text: this.text, done: this.done, createdAt: this.createdAt };
    }
    
    /** Restore a Task from a plain JSON object */
    static fromJSON(obj) {
        const t = new Task(obj.text, obj.id, obj.done);
        t.createdAt = obj.createdAt;
        return t;
    }
}

// Note - represents the freeform notes content area

class Note {
    /**
     * @param {string} content - raw text content of the note
     */
    constructor(content = '') {
        this.content   = content;
        this.updatedAt = Date.now();
    }
    
    /** Update content and refresh timestamp */
    update(content) {
        this.content   = content;
        this.updatedAt = Date.now();
    }
    
    toJSON() {
        return { content: this.content, updatedAt: this.updatedAt };
    }
    
    static fromJSON(obj) {
        const n = new Note(obj.content);
        n.updatedAt = obj.updatedAt;
        return n;
    }
}

// CalendarEvent - represents a single Good Calendar event //

class CalendarEvent {
    /**
     * @param {Object} rawEvent - raw event object from Google Calendar API
     */
    constructor(rawEvent) {
        this.id      = rawEvent.id;
        this.title   = rawEvent.summary || '(no title)';
    
        // Events can be all-day (date only) or timed (dateTime)
        const startRaw = rawEvent.start?.dateTime || rawEvent.start?.date;
        const endRaw   = rawEvent.end?.dateTime   || rawEvent.end?.date;
    
        this.start      = startRaw ? new Date(startRaw) : null;
        this.end        = endRaw   ? new Date(endRaw)   : null;
        this.isAllDay   = !rawEvent.start?.dateTime;
        this.location   = rawEvent.location || null;
    }
    
    /** Format the start time for display */
    get formattedTime() {
        if (!this.start) return '';
        if (this.isAllDay) return 'all day';
        return this.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    
    /** Format start date as a short label (e.g. "Wed, Apr 23") */
    get formattedDate() {
        if (!this.start) return '';
        return this.start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    }
}

// TaskManager - CRUD + localStorage persistance for tasks //

class TaskManager {
    constructor() {
        /** @type {Task[]} */
        this.tasks = [];
        this._load();
    }
    
    /** Add a new task; returns the new Task */
    add(text) {
        if (!text || !text.trim()) return null;
        const task = new Task(text);
        this.tasks.push(task);
        this._save();
        return task;
    }
    
    /** Toggle a task's done state by id */
    toggle(id) {
        const task = this._find(id);
        if (task) {
        task.toggle();
        this._save();
        }
        return task;
    }
    
    /** Remove a task by id */
    remove(id) {
        const before = this.tasks.length;
        this.tasks = this.tasks.filter(t => t.id !== id);
        if (this.tasks.length !== before) this._save();
    }
    
    /** Remove all completed tasks */
    clearCompleted() {
        this.tasks = this.tasks.filter(t => !t.done);
        this._save();
    }
    
    /** Count of incomplete tasks */
    get remainingCount() {
        return this.tasks.filter(t => !t.done).length;
    }
    
    // --- private helpers ---
    
    _find(id) {
        return this.tasks.find(t => t.id === id) || null;
    }
    
    _save() {
        try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.TASKS, JSON.stringify(this.tasks.map(t => t.toJSON())));
        } catch (err) {
        console.error('Claro: failed to save tasks', err);
        }
    }
    
    _load() {
        try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.TASKS);
        if (raw) {
            const parsed = JSON.parse(raw);
            this.tasks = parsed.map(obj => Task.fromJSON(obj));
        }
        } catch (err) {
        console.error('Claro: failed to load tasks', err);
        this.tasks = [];
        }
    }
}

// NoteManager - localStorage persistance for the notes area //

class NoteManager {
    constructor() {
        this.note = new Note();
        this._load();
    }
    
    /** Update the note content */
    update(content) {
        this.note.update(content);
        this._save();
    }
    
    get content() {
        return this.note.content;
    }
    
    _save() {
        try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.NOTES, JSON.stringify(this.note.toJSON()));
        } catch (err) {
        console.error('Claro: failed to save notes', err);
        }
    }
    
    _load() {
        try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.NOTES);
        if (raw) {
            this.note = Note.fromJSON(JSON.parse(raw));
        }
        } catch (err) {
        console.error('Claro: failed to load notes', err);
        }
    }
}

// CalendarManager - OAuth 2.0 sign in + Calendar API calls //

class CalendarManager {
    constructor() {
        this.accessToken = null;
        this.tokenClient = null;
        this.userName    = null;
    }
    
    /**
     * Initialize Google Identity Services token client.
     * Call this after the GIS script has loaded.
     */
    init() {
        if (!window.google) {
        console.warn('Claro: Google Identity Services not loaded.');
        return;
        }
    
        this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: (response) => {
            if (response.error) {
            console.error('Claro: OAuth error', response.error);
            return;
            }
            this.accessToken = response.access_token;
            this._onSignInSuccess();
        },
        });
    }
    
    /** Trigger the OAuth consent popup */
    signIn() {
        if (!this.tokenClient) {
        alert('Google auth is not ready yet. Please wait a moment and try again.');
        return;
        }
        // If we already have a token, prompt=none skips the consent screen
        this.tokenClient.requestAccessToken({ prompt: '' });
    }
    
    /** Revoke token and clear session */
    signOut() {
        if (this.accessToken) {
        google.accounts.oauth2.revoke(this.accessToken, () => {
            this.accessToken = null;
            this.userName    = null;
            this._saveUser(null);
        });
        }
    }
    
    /** Returns true if we have a valid access token */
    get isSignedIn() {
        return !!this.accessToken;
    }
    
    /**
     * Fetch upcoming events from Google Calendar API.
     * @returns {Promise<CalendarEvent[]>}
     */
    async fetchEvents() {
        if (!this.accessToken) throw new Error('Not signed in.');
    
        // Build time range: now → now + DAYS_AHEAD days
        const now      = new Date();
        const future   = new Date(now);
        future.setDate(future.getDate() + CONFIG.DAYS_AHEAD);
    
        const params = new URLSearchParams({
        calendarId:   'primary',
        timeMin:      now.toISOString(),
        timeMax:      future.toISOString(),
        singleEvents: 'true',
        orderBy:      'startTime',
        maxResults:   '30',
        });
    
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`;
    
        try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${this.accessToken}` },
        });
    
        // Handle token expiry
        if (response.status === 401) {
            this.accessToken = null;
            throw new Error('Token expired. Please sign in again.');
        }
    
        if (!response.ok) {
            throw new Error(`Calendar API error: ${response.status}`);
        }
    
        const data = await response.json();
        return (data.items || []).map(item => new CalendarEvent(item));
    
        } catch (err) {
        console.error('Claro: fetchEvents failed', err);
        throw err;
        }
    }
    
    /**
     * Fetch user profile name from Google People API.
     * @returns {Promise<string|null>}
     */
    async fetchUserName() {
        if (!this.accessToken) return null;
        try {
        const res = await fetch(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            { headers: { Authorization: `Bearer ${this.accessToken}` } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        this.userName = data.given_name || data.name || null;
        return this.userName;
        } catch {
        return null;
        }
    }
    
    // Called internally when sign-in token is received
    _onSignInSuccess() {
        // Dispatch a custom event so UIController can react
        document.dispatchEvent(new CustomEvent('claro:signin'));
    }
    
    _saveUser(name) {
        try {
        if (name) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.USER, name);
        } else {
            localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
        }
        } catch { /* ignore */ }
    }
}

// UIController - wires managers to the DOM //

class UIController {
    constructor(taskManager, noteManager, calendarManager) {
        this.tasks    = taskManager;
        this.notes    = noteManager;
        this.calendar = calendarManager;
    
        // Cache DOM references
        this.els = {
        authOverlay:     document.getElementById('auth-overlay'),
        app:             document.getElementById('app'),
        signInBtn:       document.getElementById('sign-in-btn'),
        signOutBtn:      document.getElementById('sign-out-btn'),
        headerDate:      document.getElementById('header-date'),
        userName:        document.getElementById('user-name'),
        weekEvents:      document.getElementById('week-events'),
        todoInput:       document.getElementById('todo-input'),
        todoAddBtn:      document.getElementById('todo-add-btn'),
        todoList:        document.getElementById('todo-list'),
        taskCount:       document.getElementById('task-count'),
        clearCompleted:  document.getElementById('clear-completed-btn'),
        notesArea:       document.getElementById('notes-area'),
        savedIndicator:  document.getElementById('saved-indicator'),
        calendarList:    document.getElementById('calendar-list'),
        };
    
        this._notesTimer   = null; // debounce timer for note auto-save
        this._savedTimer   = null; // timer to hide "saved" indicator
    
        this._bindEvents();
    }
    
    /** Attach all event listeners */
    _bindEvents() {
        // Auth
        this.els.signInBtn.addEventListener('click', () => this.calendar.signIn());
        this.els.signOutBtn.addEventListener('click', () => this._handleSignOut());
    
        // Sign-in success (fired by CalendarManager)
        document.addEventListener('claro:signin', () => this._handleSignIn());
    
        // To-do
        this.els.todoAddBtn.addEventListener('click', () => this._addTask());
        this.els.todoInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._addTask();
        });
        this.els.clearCompleted.addEventListener('click', () => {
        this.tasks.clearCompleted();
        this._renderTasks();
        });
    
        // Notes — debounced auto-save
        this.els.notesArea.addEventListener('input', () => {
        clearTimeout(this._notesTimer);
        this._notesTimer = setTimeout(() => {
            this.notes.update(this.els.notesArea.value);
            this._showSaved();
        }, 800);
        });
    }
    
    /** Called after successful Google sign-in */
    async _handleSignIn() {
        // Show app, hide auth overlay
        this.els.authOverlay.classList.add('hidden');
        this.els.app.classList.remove('hidden');
    
        // Set date in header
        this.els.headerDate.textContent = new Date().toLocaleDateString([], {
        weekday: 'long', month: 'long', day: 'numeric',
        });
    
        // Fetch user name
        const name = await this.calendar.fetchUserName();
        if (name) {
        this.els.userName.textContent = name;
        }
    
        // Render tasks and notes from storage
        this._renderTasks();
        this.els.notesArea.value = this.notes.content;
    
        // Fetch and render calendar events
        this._renderCalendar();
    }
    
    /** Called on sign-out */
    _handleSignOut() {
        this.calendar.signOut();
        this.els.app.classList.add('hidden');
        this.els.authOverlay.classList.remove('hidden');
    }
    
    // ---- TO-DO METHODS ----
    
    /** Read input, add task, re-render */
    _addTask() {
        const text = this.els.todoInput.value.trim();
        if (!text) return;
        this.tasks.add(text);
        this.els.todoInput.value = '';
        this._renderTasks();
        this.els.todoInput.focus();
    }
    
    /** Re-render the entire task list from TaskManager state */
    _renderTasks() {
        const list = this.els.todoList;
        list.innerHTML = '';
    
        if (this.tasks.tasks.length === 0) {
        list.innerHTML = '<li class="empty-state">nothing here yet — add a task above</li>';
        } else {
        this.tasks.tasks.forEach(task => {
            list.appendChild(this._buildTaskEl(task));
        });
        }
    
        // Update count label
        const remaining = this.tasks.remainingCount;
        this.els.taskCount.textContent = `${remaining} left`;
    }
    
    /**
     * Build a single <li> element for a task.
     * @param {Task} task
     * @returns {HTMLElement}
     */
    _buildTaskEl(task) {
        const li = document.createElement('li');
        li.className = `todo-item${task.done ? ' done' : ''}`;
        li.dataset.id = task.id;
    
        // Checkbox circle
        const checkbox = document.createElement('button');
        checkbox.className  = 'todo-checkbox';
        checkbox.setAttribute('aria-label', task.done ? 'Mark incomplete' : 'Mark complete');
        checkbox.innerHTML  = `<svg class="todo-checkbox-check" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 4l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
        checkbox.addEventListener('click', () => {
        this.tasks.toggle(task.id);
        this._renderTasks();
        });
    
        // Text
        const span = document.createElement('span');
        span.className   = 'todo-text';
        span.textContent = task.text;
    
        // Delete button
        const del = document.createElement('button');
        del.className        = 'todo-delete';
        del.setAttribute('aria-label', 'Delete task');
        del.textContent      = '×';
        del.addEventListener('click', () => {
        this.tasks.remove(task.id);
        this._renderTasks();
        });
    
        li.append(checkbox, span, del);
        return li;
    }
    
    // ---- NOTES METHODS ----
    
    /** Flash the "saved" indicator */
    _showSaved() {
        this.els.savedIndicator.classList.add('visible');
        clearTimeout(this._savedTimer);
        this._savedTimer = setTimeout(() => {
        this.els.savedIndicator.classList.remove('visible');
        }, 2000);
    }
    
    // ---- CALENDAR METHODS ----
    
    /** Fetch events and render both the week banner and the calendar panel */
    async _renderCalendar() {
        try {
        const events = await this.calendar.fetchEvents();
        this._renderWeekBanner(events);
        this._renderCalendarPanel(events);
        } catch (err) {
        this.els.weekEvents.innerHTML   = '<span class="loading-text">could not load events</span>';
        this.els.calendarList.innerHTML = `<p class="cal-error">Could not load calendar: ${err.message}</p>`;
        }
    }
    
    /**
     * Render the horizontal week banner chips.
     * @param {CalendarEvent[]} events
     */
    _renderWeekBanner(events) {
        const container = this.els.weekEvents;
        container.innerHTML = '';
    
        if (events.length === 0) {
        container.innerHTML = '<span class="loading-text">nothing scheduled — enjoy the quiet</span>';
        return;
        }
    
        // Show up to 6 chips in the banner
        events.slice(0, 6).forEach(evt => {
        const chip = document.createElement('span');
        chip.className = 'week-chip';
        chip.innerHTML = `<span class="week-chip-dot"></span>${evt.formattedDate} · ${evt.title}`;
        container.appendChild(chip);
        });
    
        if (events.length > 6) {
        const more = document.createElement('span');
        more.className   = 'week-chip';
        more.textContent = `+${events.length - 6} more`;
        container.appendChild(more);
        }
    }
    
    /**
     * Render the calendar panel, grouped by day.
     * @param {CalendarEvent[]} events
     */
    _renderCalendarPanel(events) {
        const container = this.els.calendarList;
        container.innerHTML = '';
    
        if (events.length === 0) {
        container.innerHTML = '<p class="cal-empty">no events in the next 7 days</p>';
        return;
        }
    
        // Group events by formatted date string
        const grouped = {};
        events.forEach(evt => {
        const key = evt.formattedDate;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(evt);
        });
    
        Object.entries(grouped).forEach(([day, dayEvents]) => {
        const group = document.createElement('div');
        group.className = 'cal-day-group';
    
        const label = document.createElement('div');
        label.className   = 'cal-day-label';
        label.textContent = day;
        group.appendChild(label);
    
        dayEvents.forEach(evt => {
            const item = document.createElement('div');
            item.className = 'cal-event';
    
            const time = document.createElement('div');
            time.className   = 'cal-event-time';
            time.textContent = evt.formattedTime;
    
            const title = document.createElement('div');
            title.className   = 'cal-event-title';
            title.textContent = evt.title;
    
            item.append(time, title);
            group.appendChild(item);
        });
    
        container.appendChild(group);
        });
    }
}

// APP INIT - bootstraps everything on DOMContentLoaded //

document.addEventListener('DOMContentLoaded', () => {
    // Instantiate managers
    const taskManager    = new TaskManager();
    const noteManager    = new NoteManager();
    const calendarManager = new CalendarManager();
    
    // Instantiate UI controller
    const ui = new UIController(taskManager, noteManager, calendarManager);
    
    // Wait for Google Identity Services script to load, then init OAuth
    // The GIS script is loaded async in index.html, so we poll briefly
    let attempts = 0;
    const initGIS = setInterval(() => {
        attempts++;
        if (window.google && window.google.accounts) {
        clearInterval(initGIS);
        calendarManager.init();
        } else if (attempts > 20) {
        // Give up after ~2 seconds
        clearInterval(initGIS);
        console.warn('Claro: Google Identity Services failed to load.');
        }
    }, 100);
});
