import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

type PermissionState = 'default' | 'granted' | 'denied';
type Tab = 'priority' | 'all';

const TAB_STORAGE_KEY = 'admin-notif-tab';

// VAPID public key injected by Cloudflare Workers vars
const VAPID_PUBLIC_KEY = (globalThis as any).__PUBLIC_VAPID_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('default');
  const [isStandalone, setIsStandalone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTabState] = useState<Tab>('priority');

  // Hydrate tab from localStorage after mount (SSR-safe)
  useEffect(() => {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    if (stored === 'all' || stored === 'priority') setTabState(stored);
  }, []);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    try { localStorage.setItem(TAB_STORAGE_KEY, t); } catch {}
  }, []);

  // Push subscription state
  const status = useQuery(api.pushNotifications.getSubscriptionStatus, {});
  const storeSub = useMutation(api.pushNotifications.storePushSubscription);
  const removeSub = useMutation(api.pushNotifications.removePushSubscription);
  const subscribed = status?.subscribed ?? false;

  // Notification log — both tabs' data kept live so badge counts + switching are instant
  const notifications = useQuery(api.adminNotifications.list, { tab });
  const priorityUnread = useQuery(api.adminNotifications.unreadCount, { tab: 'priority' }) ?? 0;
  const allUnread = useQuery(api.adminNotifications.unreadCount, { tab: 'all' }) ?? 0;
  const markAsRead = useMutation(api.adminNotifications.markAsRead);
  const markAllRead = useMutation(api.adminNotifications.markAllAsRead);

  const totalUnread = allUnread;
  const nonPriorityUnread = Math.max(0, allUnread - priorityUnread);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission as PermissionState);
    }
    const mq = window.matchMedia('(display-mode: standalone)');
    setIsStandalone(mq.matches || (navigator as any).standalone === true);
    // Clear app badge when PWA opens (user is looking at the app)
    if ('clearAppBadge' in navigator) (navigator as any).clearAppBadge();
  }, []);

  // Sync app badge with priority unread count (attention-ranked)
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    if (priorityUnread > 0) {
      (navigator as any).setAppBadge(priorityUnread);
    } else {
      (navigator as any).clearAppBadge();
    }
  }, [priorityUnread]);

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) {
      console.warn('VAPID public key not configured');
      return;
    }

    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== 'granted') return;

      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Service worker not active — try removing and re-adding the PWA to Home Screen')), 5000)
        ),
      ]);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = sub.toJSON();
      await storeSub({
        endpoint: json.endpoint!,
        keyP256dh: json.keys!.p256dh!,
        keyAuth: json.keys!.auth!,
      });
    } catch (err: any) {
      console.error('Push subscribe failed:', err);
      alert(err?.message || 'Failed to enable push notifications');
    } finally {
      setLoading(false);
    }
  }, [storeSub]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      let endpoint: string | undefined;
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('sw-timeout')), 3000)
          ),
        ]);
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          endpoint = sub.endpoint;
          await sub.unsubscribe().catch(() => {});
        }
      } catch {
        // SW not ready or device has no sub — still clear the DB below.
      }
      await removeSub(endpoint ? { endpoint } : {});
    } catch (err: any) {
      console.error('Push unsubscribe failed:', err);
      alert(err?.message || 'Failed to unsubscribe');
    } finally {
      setLoading(false);
    }
  }, [removeSub]);

  const handleNotificationClick = async (id: Id<"adminNotifications">, url?: string) => {
    await markAsRead({ id });
    if (url) {
      const quoteMatch = url.match(/^\/admin\/quotes\/(.+)$/);
      if (quoteMatch) {
        window.location.href = `/admin/inbox?quote=${quoteMatch[1]}`;
      } else {
        window.location.href = url;
      }
    }
  };

  const isIosNotStandalone =
    /iPad|iPhone/.test(navigator.userAgent) && !isStandalone;

  const BellIcon =
    permission === 'denied' ? BellOff : subscribed ? BellRing : Bell;

  // Bell badge: red when priority unread > 0, slate when only non-priority, hidden when zero.
  const badgeColor = priorityUnread > 0 ? 'bg-red-500' : 'bg-slate-400';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-slate-400 hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <BellIcon className="w-5 h-5" />
        {totalUnread > 0 && (
          <span className={`absolute top-1.5 right-1.5 w-2 h-2 ${badgeColor} rounded-full`} />
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Popover */}
          <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <h3 className="text-sm font-semibold text-white">
                Notifications
              </h3>
              {(tab === 'priority' ? priorityUnread : allUnread) > 0 && (
                <button
                  onClick={() => markAllRead({ tab })}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Tab switcher */}
            <div role="tablist" className="flex border-b border-slate-700">
              <button
                role="tab"
                aria-selected={tab === 'priority'}
                onClick={() => setTab('priority')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                  tab === 'priority'
                    ? 'text-white border-b-2 border-teal-400 -mb-px bg-slate-700/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Priority
                {priorityUnread > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                    {priorityUnread}
                  </span>
                )}
              </button>
              <button
                role="tab"
                aria-selected={tab === 'all'}
                onClick={() => setTab('all')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                  tab === 'all'
                    ? 'text-white border-b-2 border-teal-400 -mb-px bg-slate-700/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All
                {nonPriorityUnread > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-slate-600 text-white text-[10px] font-semibold">
                    {nonPriorityUnread}
                  </span>
                )}
              </button>
            </div>

            {/* Notification list */}
            <div className="max-h-64 overflow-y-auto">
              {!notifications || notifications.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  {tab === 'priority' ? 'No priority notifications' : 'No notifications yet'}
                </p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n._id}
                    onClick={() => handleNotificationClick(n._id, n.url)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-700/50 transition-colors border-l-2 ${
                      n.isRead
                        ? 'border-transparent'
                        : n.isPriority
                          ? 'border-red-500 bg-slate-700/25'
                          : 'border-slate-500 bg-slate-700/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-xs font-medium ${n.isRead ? 'text-slate-400' : 'text-white'}`}>
                        {n.title}
                      </span>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap flex-shrink-0">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                      {n.body}
                    </p>
                  </button>
                ))
              )}
            </div>

            {/* Push subscription toggle */}
            <div className="border-t border-slate-700 px-4 py-3">
              {!('serviceWorker' in navigator) || !('PushManager' in window) ? (
                <p className="text-xs text-slate-500">
                  Push not supported in this browser.
                </p>
              ) : isIosNotStandalone ? (
                <p className="text-xs text-slate-500">
                  Add to Home Screen for push notifications on iOS.
                </p>
              ) : permission === 'denied' ? (
                <p className="text-xs text-slate-500">
                  Notifications blocked in browser settings.
                </p>
              ) : subscribed ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Push notifications on</span>
                  <button
                    onClick={unsubscribe}
                    disabled={loading}
                    className="text-xs text-slate-400 hover:text-white border border-slate-600 rounded px-2 py-1 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Disabling...' : 'Disable'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Push notifications off</span>
                  <button
                    onClick={subscribe}
                    disabled={loading}
                    className="text-xs font-medium text-slate-900 bg-teal-400 hover:bg-teal-300 rounded px-2 py-1 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Enabling...' : 'Enable'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
