(() => {
  const root = document.querySelector('[data-booking-calendar]');
  if (!root) return;

  const checkin = document.querySelector('#checkin');
  const checkout = document.querySelector('#checkout');
  const endpoint = root.dataset.endpoint;
  const roomId = root.dataset.roomId;
  const monthsRoot = root.querySelector('.calendar-months');
  const status = root.querySelector('.calendar-status');
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const parse = value => new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
  let blocked = new Set();
  let availabilityLoaded = false;
  let selectingCheckout = false;

  function monthGrid(month) {
    const section = document.createElement('section');
    section.className = 'calendar-month';
    const heading = document.createElement('h3');
    heading.textContent = monthName.format(month);
    section.append(heading);
    const weekdays = document.createElement('div');
    weekdays.className = 'calendar-weekdays';
    weekdays.innerHTML = '<span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>';
    section.append(weekdays);
    const days = document.createElement('div');
    days.className = 'calendar-days';
    const firstWeekday = month.getDay();
    const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let i = 0; i < firstWeekday; i += 1) days.append(blankDay());
    for (let day = 1; day <= dayCount; day += 1) {
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      const value = iso(date);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      const dayNumber = document.createElement('span');
      dayNumber.className = 'calendar-day-number';
      dayNumber.textContent = day;
      button.append(dayNumber);
      button.dataset.date = value;
      const isPast = date < today;
      const isBlocked = blocked.has(value);
      button.disabled = isPast || isBlocked || !availabilityLoaded;
      button.classList.toggle('past', isPast);
      button.classList.toggle('blocked', isBlocked);
      button.classList.toggle('unavailable', !isPast && !isBlocked && !availabilityLoaded);
      button.classList.toggle('available', !isPast && !isBlocked && availabilityLoaded);
      if (!isPast && availabilityLoaded) {
        const dayStatus = document.createElement('span');
        dayStatus.className = 'calendar-day-status';
        dayStatus.textContent = isBlocked ? 'Blocked' : 'Available';
        button.append(dayStatus);
      }
      if (value === checkin.value || value === checkout.value) button.classList.add('selected');
      if (checkin.value && checkout.value && value > checkin.value && value < checkout.value) button.classList.add('in-range');
      button.setAttribute('aria-label', `${value}, ${isBlocked ? 'Blocked' : isPast ? 'Past' : availabilityLoaded ? 'Available' : 'Availability unavailable'}`);
      button.addEventListener('click', () => chooseDate(value));
      days.append(button);
    }
    section.append(days);
    return section;
  }

  function blankDay() {
    const blank = document.createElement('span');
    blank.className = 'calendar-day outside';
    return blank;
  }

  function chooseDate(value) {
    if (!selectingCheckout || value <= checkin.value) {
      checkin.value = value;
      const next = parse(value);
      next.setDate(next.getDate() + 1);
      checkout.value = iso(next);
      checkout.min = iso(next);
      selectingCheckout = true;
      checkin.dispatchEvent(new Event('change'));
    } else {
      checkout.value = value;
      selectingCheckout = false;
      checkout.dispatchEvent(new Event('change'));
    }
    render();
  }

  async function loadAvailability() {
    const start = new Date(cursor);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 1);
    status.className = 'calendar-status';
    status.textContent = 'Loading live availability…';
    availabilityLoaded = false;
    render();
    try {
      const params = new URLSearchParams({ roomId, checkin: iso(start), checkout: iso(end) });
      const response = await fetch(`${endpoint}?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load availability.');
      blocked = new Set(data.blockedDates || []);
      availabilityLoaded = true;
      status.textContent = 'Live availability';
    } catch (error) {
      blocked = new Set();
      availabilityLoaded = false;
      status.className = 'calendar-status error';
      status.textContent = 'Availability could not be loaded';
    }
    render();
  }

  function render() {
    monthsRoot.replaceChildren(monthGrid(cursor), monthGrid(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)));
  }

  root.querySelector('[data-calendar-prev]').addEventListener('click', () => {
    const previous = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    if (previous < new Date(today.getFullYear(), today.getMonth(), 1)) return;
    cursor = previous;
    loadAvailability();
  });
  root.querySelector('[data-calendar-next]').addEventListener('click', () => {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    loadAvailability();
  });
  checkin.addEventListener('change', render);
  checkout.addEventListener('change', render);
  loadAvailability();
})();
