import { useEffect, useState } from "react";

import {
  getNotificationSettings,
  registerPushToken,
  type NotificationChannel,
  updateNotificationSettings,
} from "../api/apps";
import { subscribeCurrentDeviceToPush } from "../lib/push";

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

export default function NotificationsPage() {
  const [channel, setChannel] = useState<NotificationChannel>("email");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to subscribe this device",
      );
    } finally {
      setSubscribing(false);
    }
  }

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
