import { useEffect, useState } from "react";

import {
  deletePushToken,
  getNotificationSettings,
  listPushTokens,
  type NotificationChannel,
  type PushTokenRecord,
  registerPushToken,
  unregisterPushToken,
  updateNotificationSettings,
} from "../api/apps";
import { getCurrentDeviceToken, subscribeCurrentDeviceToPush } from "../lib/push";

const CHANNEL_OPTIONS: Array<{ value: NotificationChannel; label: string }> = [
  { value: "email", label: "Email only" },
  { value: "push", label: "Web push only" },
  { value: "both", label: "Email + Push" },
];

function buildDeviceLabel() {
  const userAgentData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  const platform =
    userAgentData?.platform || navigator.platform || "unknown-platform";
  const ua = navigator.userAgent || "unknown-agent";
  return `${platform} | ${ua.slice(0, 80)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function NotificationsPage() {
  const [channel, setChannel] = useState<NotificationChannel>("email");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tokens, setTokens] = useState<PushTokenRecord[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [unsubscribing, setUnsubscribing] = useState(false);

  const currentToken = getCurrentDeviceToken();

  function loadTokens() {
    setTokensLoading(true);
    listPushTokens()
      .then(setTokens)
      .catch(() => {})
      .finally(() => setTokensLoading(false));
  }

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    getNotificationSettings()
      .then((settings) => {
        if (cancelled) return;
        setChannel(settings.channel);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "Failed to load notification settings",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    loadTokens();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveChannelPreference() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const updated = await updateNotificationSettings(channel);
      setChannel(updated.channel);
      setMessage("Notification preference saved.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to save notification settings",
      );
    } finally {
      setSaving(false);
    }
  }

  async function subscribeDevice() {
    setSubscribing(true);
    setError(null);
    setMessage(null);

    try {
      const token = await subscribeCurrentDeviceToPush();
      await registerPushToken({
        token,
        deviceLabel: buildDeviceLabel(),
      });
      setMessage("This device is now subscribed to push notifications.");
      loadTokens();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to subscribe this device",
      );
    } finally {
      setSubscribing(false);
    }
  }

  async function handleUnsubscribeCurrent() {
    if (!currentToken) return;
    setUnsubscribing(true);
    setError(null);
    setMessage(null);

    try {
      await unregisterPushToken(currentToken);
      localStorage.removeItem("push_token");
      setMessage("This device has been unsubscribed.");
      loadTokens();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to unsubscribe this device",
      );
    } finally {
      setUnsubscribing(false);
    }
  }

  async function handleDeleteToken(id: number) {
    setDeletingId(id);
    setError(null);
    setMessage(null);

    try {
      await deletePushToken(id);
      setMessage("Subscription removed.");
      loadTokens();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to remove subscription",
      );
    } finally {
      setDeletingId(null);
    }
  }

  const currentTokenRecord = currentToken
    ? tokens.find((t) => t.token === currentToken)
    : null;
  const otherTokens = tokens.filter((t) => t.token !== currentToken);

  return (
    <div>
      <section className="pageHeader">
        <div>
          <div className="pageHeader__title">Notifications</div>
          <div className="pageHeader__subtitle">
            Choose alert channel for server crashes and subscribe this device to
            web push.
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel__title">Alert channel</div>

        <div className="notificationsForm">
          <label className="field">
            <span className="field__label">Notification mode</span>
            <select
              value={channel}
              disabled={loading || saving}
              onChange={(e) =>
                setChannel(e.target.value as NotificationChannel)
              }
            >
              {CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            className="btn"
            type="button"
            disabled={loading || saving}
            onClick={saveChannelPreference}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel__title">Push web</div>
        <p className="notificationsHint">
          Click to generate an FCM token and register this browser as a push
          target.
        </p>

        <button
          className="btn"
          type="button"
          disabled={subscribing}
          onClick={subscribeDevice}
        >
          {subscribing
            ? "Subscribing..."
            : "Add this device to push notifications"}
        </button>
      </section>

      <section className="panel">
        <div className="panel__title">Subscribed devices</div>

        {tokensLoading ? (
          <p className="notificationsHint">Loading...</p>
        ) : tokens.length === 0 ? (
          <p className="notificationsHint">No devices subscribed yet.</p>
        ) : (
          <div className="tokenList">
            {currentTokenRecord && (
              <div className="tokenList__item tokenList__item--current">
                <div className="tokenList__info">
                  <span className="tokenList__label">
                    {currentTokenRecord.deviceLabel || "Unknown device"}
                  </span>
                  <span className="tokenList__badge">This device</span>
                  <span className="tokenList__date">
                    Subscribed {formatDate(currentTokenRecord.createdAt)}
                  </span>
                </div>
                <button
                  className="btn btn--danger btn--sm"
                  type="button"
                  disabled={unsubscribing}
                  onClick={handleUnsubscribeCurrent}
                >
                  {unsubscribing ? "Unsubscribing..." : "Unsubscribe"}
                </button>
              </div>
            )}

            {otherTokens.map((t) => (
              <div key={t.id} className="tokenList__item">
                <div className="tokenList__info">
                  <span className="tokenList__label">
                    {t.deviceLabel || "Unknown device"}
                  </span>
                  <span className="tokenList__date">
                    Subscribed {formatDate(t.createdAt)}
                  </span>
                </div>
                <button
                  className="btn btn--danger btn--sm"
                  type="button"
                  disabled={deletingId === t.id}
                  onClick={() => handleDeleteToken(t.id)}
                >
                  {deletingId === t.id ? "Removing..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {message ? (
        <div className="notificationsMessage notificationsMessage--ok">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="notificationsMessage notificationsMessage--error">
          {error}
        </div>
      ) : null}
    </div>
  );
}
