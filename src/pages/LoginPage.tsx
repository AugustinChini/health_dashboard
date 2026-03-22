import { useState } from "react";
import { login } from "../api/apps";

export default function LoginPage({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const [digits, setDigits] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleDigit(d: string) {
    if (digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    setError(null);

    if (next.length === 4) {
      submit(next);
    }
  }

  function handleDelete() {
    setDigits((prev) => prev.slice(0, -1));
    setError(null);
  }

  async function submit(pin: string) {
    setLoading(true);
    setError(null);

    try {
      await login(pin);
      onSuccess();
    } catch (e) {
      let msg = "Invalid pin";
      if (e instanceof Error) {
        try {
          const parsed = JSON.parse(e.message);
          msg = parsed.error || e.message;
        } catch {
          msg = e.message;
        }
      }
      setError(msg);
      setDigits("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="brand">
          <div className="brand__mark" aria-hidden="true" />
          <div>
            <div className="brand__name">Health Dashboard</div>
            <div className="brand__subtitle">Monitoring & registry</div>
          </div>
        </div>

        <div className="loginCard__prompt">Enter your 4-digit PIN</div>

        <div className="pinDots">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={
                i < digits.length ? "pinDot pinDot--filled" : "pinDot"
              }
            />
          ))}
        </div>

        {error && <div className="loginCard__error">{error}</div>}

        <div className="pinPad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              className="pinPad__key"
              disabled={loading}
              onClick={() => handleDigit(d)}
            >
              {d}
            </button>
          ))}
          <div />
          <button
            type="button"
            className="pinPad__key"
            disabled={loading}
            onClick={() => handleDigit("0")}
          >
            0
          </button>
          <button
            type="button"
            className="pinPad__key pinPad__key--delete"
            disabled={loading || digits.length === 0}
            onClick={handleDelete}
          >
            &larr;
          </button>
        </div>
      </div>
    </div>
  );
}
