// Layout.jsx owns the sidebar badge counts and only re-fetches them on
// navigation. Pages that approve/file/update a request in place (no route
// change) call this afterward so the badge doesn't lag until the user
// happens to navigate elsewhere.
const EVENT = 'notifications:refresh';

export function refreshNotifications() {
  window.dispatchEvent(new Event(EVENT));
}

export function onNotificationsRefresh(handler) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
