const STORAGE_KEY = "daybook.tasks.v1";
const filters = new Set(["all", "today", "upcoming", "completed"]);
const headings = {
  all: ["A FRESH PAGE", "Your day, <em>your pace.</em>", "Make room for what matters.", "Your tasks"],
  today: ["THE DAY AHEAD", "One day at a <em>time.</em>", "A good place to begin.", "Today's tasks"],
  upcoming: ["ON THE HORIZON", "Make space for <em>what's next.</em>", "The future, without the rush.", "Upcoming tasks"],
  completed: ["LOOK HOW FAR", "You made it <em>happen.</em>", "Every finished thing counts.", "Completed tasks"],
};
const priorityOrder = { high: 0, normal: 1, low: 2 };
const today = localDate(new Date());

let tasks = loadTasks();
let activeFilter = "all";
let searchTerm = "";
let sortOrder = "created";
let editingId = null;
let toastTimeout;

const elements = {
  taskForm: document.querySelector("#task-form"),
  taskTitle: document.querySelector("#task-title"),
  taskDate: document.querySelector("#task-date"),
  taskPriority: document.querySelector("#task-priority"),
  taskList: document.querySelector("#task-list"),
  emptyState: document.querySelector("#empty-state"),
  searchInput: document.querySelector("#search-input"),
  sortSelect: document.querySelector("#sort-select"),
  progressCount: document.querySelector("#progress-count"),
  progressBar: document.querySelector("#progress-bar"),
  progressFill: document.querySelector("#progress-fill"),
  progressPercent: document.querySelector("#progress-percent"),
  editDialog: document.querySelector("#edit-dialog"),
  editForm: document.querySelector("#edit-form"),
  editTitle: document.querySelector("#edit-task-title"),
  editDate: document.querySelector("#edit-task-date"),
  editPriority: document.querySelector("#edit-task-priority"),
  toast: document.querySelector("#toast"),
};

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validTask(task) {
  return task && typeof task.id === "string" && typeof task.title === "string" &&
    typeof task.createdAt === "number" && typeof task.completed === "boolean" &&
    ["high", "normal", "low"].includes(task.priority);
}

function loadTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter(validTask) : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch {
    showToast("Couldn't save changes. Check your browser storage settings.");
    return false;
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function dateLabel(dateString) {
  if (!dateString) return "";
  if (dateString === today) return "Today";
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateString === localDate(tomorrow)) return "Tomorrow";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function isOverdue(task) {
  return !task.completed && task.dueDate && task.dueDate < today;
}

function visibleTasks() {
  const matched = tasks.filter((task) => {
    const matchesFilter = activeFilter === "completed"
      ? task.completed
      : !task.completed && (activeFilter === "all" ||
        (activeFilter === "today" && task.dueDate === today) ||
        (activeFilter === "upcoming" && task.dueDate > today));
    return matchesFilter && task.title.toLocaleLowerCase().includes(searchTerm);
  });

  return matched.sort((a, b) => {
    if (sortOrder === "priority") {
      return priorityOrder[a.priority] - priorityOrder[b.priority] || b.createdAt - a.createdAt;
    }
    if (sortOrder === "due") {
      const dueA = a.dueDate || "9999-12-31";
      const dueB = b.dueDate || "9999-12-31";
      return dueA.localeCompare(dueB) || b.createdAt - a.createdAt;
    }
    return b.createdAt - a.createdAt;
  });
}

function renderTask(task) {
  const dueDate = dateLabel(task.dueDate);
  const priority = task.priority === "normal" ? "" : `<span class="priority-tag ${task.priority}">${escapeHTML(task.priority === "high" ? "High priority" : "Low priority")}</span>`;
  const date = dueDate ? `<span class="task-date${isOverdue(task) ? " is-overdue" : ""}">${isOverdue(task) ? "Overdue · " : "Due "}${escapeHTML(dueDate)}</span>` : "";

  return `<li class="task-row${task.completed ? " is-completed" : ""}" data-id="${escapeHTML(task.id)}">
    <button class="task-check${task.completed ? " is-done" : ""}" type="button" data-action="toggle" aria-label="${task.completed ? "Mark incomplete" : "Complete task"}" aria-pressed="${task.completed}" title="${task.completed ? "Mark incomplete" : "Complete task"}"></button>
    <div class="task-main"><p class="task-title">${escapeHTML(task.title)}</p><div class="task-meta">${date}${priority}</div></div>
    <div class="task-actions">
      <button class="icon-button" type="button" data-action="edit" aria-label="Edit ${escapeHTML(task.title)}" title="Edit task">✎</button>
      <button class="icon-button delete-button" type="button" data-action="delete" aria-label="Delete ${escapeHTML(task.title)}" title="Delete task">×</button>
    </div>
  </li>`;
}

function renderCounts() {
  const activeTasks = tasks.filter((task) => !task.completed);
  document.querySelector("#count-all").textContent = activeTasks.length;
  document.querySelector("#count-today").textContent = activeTasks.filter((task) => task.dueDate === today).length;
  document.querySelector("#count-upcoming").textContent = activeTasks.filter((task) => task.dueDate > today).length;
  document.querySelector("#count-completed").textContent = tasks.filter((task) => task.completed).length;

  const todayTasks = activeTasks.filter((task) => task.dueDate === today);
  const completedToday = tasks.filter((task) => task.completed && task.dueDate === today).length;
  const totalToday = todayTasks.length + completedToday;
  const doneToday = totalToday === 0 ? 0 : Math.round((completedToday / totalToday) * 100);
  elements.progressCount.textContent = `${completedToday} / ${totalToday}`;
  elements.progressPercent.textContent = `${doneToday}%`;
  elements.progressFill.style.width = `${doneToday}%`;
  elements.progressBar.setAttribute("aria-valuenow", String(doneToday));
}

function render() {
  const [eyebrow, title, subtitle, listTitle] = headings[activeFilter];
  document.querySelector("#heading-eyebrow").textContent = eyebrow;
  document.querySelector("#page-title").innerHTML = title;
  document.querySelector("#page-subtitle").textContent = subtitle;
  document.querySelector("#list-heading").textContent = listTitle;

  document.querySelectorAll(".nav-item").forEach((button) => {
    const selected = button.dataset.filter === activeFilter;
    button.classList.toggle("is-active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  const shownTasks = visibleTasks();
  elements.taskList.innerHTML = shownTasks.map(renderTask).join("");
  document.querySelector("#list-total").textContent = shownTasks.length;
  elements.emptyState.hidden = shownTasks.length > 0;
  document.querySelector("#empty-title").textContent = searchTerm ? "Nothing found just yet." :
    activeFilter === "completed" ? "Your next win is waiting." : "A little breathing room.";
  document.querySelector("#empty-copy").textContent = searchTerm ? "Try another search, or add this task above." :
    activeFilter === "completed" ? "Finished tasks will find a home here." : "Add a task above and get it out of your head.";
  document.querySelector("#clear-completed").hidden = !tasks.some((task) => task.completed);
  renderCounts();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
}

function addTask(event) {
  event.preventDefault();
  const title = elements.taskTitle.value.trim();
  if (!title) {
    elements.taskTitle.focus();
    return;
  }

  const task = {
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    dueDate: elements.taskDate.value,
    priority: elements.taskPriority.value,
    completed: false,
    createdAt: Date.now(),
  };
  tasks.unshift(task);
  saveTasks();
  elements.taskForm.reset();
  if (activeFilter === "completed") setFilter("all");
  else render();
  elements.taskTitle.focus();
  showToast("Task added. One step closer.");
}

function setFilter(filter) {
  if (!filters.has(filter)) return;
  activeFilter = filter;
  render();
}

function openEdit(task) {
  editingId = task.id;
  elements.editTitle.value = task.title;
  elements.editDate.value = task.dueDate || "";
  elements.editPriority.value = task.priority;
  elements.editDialog.showModal();
  elements.editTitle.focus();
}

function saveEdit(event) {
  event.preventDefault();
  const task = tasks.find((item) => item.id === editingId);
  const title = elements.editTitle.value.trim();
  if (!task || !title) return;
  task.title = title;
  task.dueDate = elements.editDate.value;
  task.priority = elements.editPriority.value;
  saveTasks();
  elements.editDialog.close();
  editingId = null;
  render();
  showToast("Your changes are saved.");
}

function initializeDate() {
  const now = new Date();
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric",
  }).format(now);
  document.querySelector("#date-day").textContent = new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(now);
  document.querySelector("#date-month").textContent = new Intl.DateTimeFormat(undefined, { month: "short" }).format(now);
}

document.querySelector(".view-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (button) setFilter(button.dataset.filter);
});

elements.taskForm.addEventListener("submit", addTask);
elements.searchInput.addEventListener("input", () => {
  searchTerm = elements.searchInput.value.trim().toLocaleLowerCase();
  render();
});
elements.sortSelect.addEventListener("change", () => {
  sortOrder = elements.sortSelect.value;
  render();
});
elements.taskList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const row = button.closest("[data-id]");
  const task = tasks.find((item) => item.id === row?.dataset.id);
  if (!task) return;

  if (button.dataset.action === "toggle") {
    task.completed = !task.completed;
    saveTasks();
    render();
    showToast(task.completed ? "Nicely done." : "Moved back to your list.");
  } else if (button.dataset.action === "delete") {
    tasks = tasks.filter((item) => item.id !== task.id);
    saveTasks();
    render();
    showToast("Task removed.");
  } else if (button.dataset.action === "edit") {
    openEdit(task);
  }
});

elements.editForm.addEventListener("submit", saveEdit);
document.querySelector(".dialog-close").addEventListener("click", () => elements.editDialog.close());
document.querySelector(".cancel-button").addEventListener("click", () => elements.editDialog.close());
elements.editDialog.addEventListener("close", () => { editingId = null; });
elements.editDialog.addEventListener("click", (event) => {
  if (event.target === elements.editDialog) elements.editDialog.close();
});
document.querySelector("#clear-completed").addEventListener("click", () => {
  const completedCount = tasks.filter((task) => task.completed).length;
  if (!completedCount) return;
  tasks = tasks.filter((task) => !task.completed);
  saveTasks();
  render();
  showToast(`${completedCount} completed ${completedCount === 1 ? "task" : "tasks"} cleared.`);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) && !elements.editDialog.open) {
    event.preventDefault();
    elements.searchInput.focus();
  }
  if (event.key === "Escape" && !elements.editDialog.open && document.activeElement === elements.searchInput) {
    elements.searchInput.value = "";
    searchTerm = "";
    render();
  }
});
initializeDate();
render();