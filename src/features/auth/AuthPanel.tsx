import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getAuthRedirectUrl, supabase } from "./supabaseClient";
import { withTimeout } from "../../utils/withTimeout";

type FormMode = "sign_in" | "sign_up";

export function AuthPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(supabase));
  const [mode, setMode] = useState<FormMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionRestoreFailed, setSessionRestoreFailed] = useState(false);
  const [sessionRetry, setSessionRetry] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    const authClient = supabase;
    let active = true;
    const { data: { subscription } } = authClient.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setCheckingSession(false);
    });
    const restoreSession = async () => {
      setCheckingSession(true);
      setError("");
      setSessionRestoreFailed(false);
      try {
        const { data, error: sessionError } = await withTimeout(
          authClient.auth.getSession(),
          8_000,
          "SESSION_RESTORE_TIMEOUT",
        );
        if (sessionError) throw sessionError;
        if (active) setSession(data.session);
      } catch (sessionError) {
        if (!active) return;
        setSession(null);
        setSessionRestoreFailed(true);
        setError(sessionError instanceof Error && sessionError.message === "SESSION_RESTORE_TIMEOUT"
          ? "恢复登录状态超时；本地功能仍可使用，请重试或稍后再试。"
          : sessionError instanceof Error ? sessionError.message : "恢复登录状态失败。请重试。");
      } finally {
        if (active) setCheckingSession(false);
      }
    };
    void restoreSession();
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [sessionRetry]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    setSessionRestoreFailed(false);
    try {
      if (mode === "sign_up") {
        const { data, error: authError } = await withTimeout(supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        }), 15_000, "AUTH_REQUEST_TIMEOUT");
        if (authError) throw authError;
        if (data.session) {
          setSession(data.session);
          setMessage("注册成功，已登录。");
        } else {
          setMessage("注册请求已提交。请查收确认邮件，点击邮件链接返回 Meoini 完成验证。");
        }
      } else {
        const { data, error: authError } = await withTimeout(supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }), 15_000, "AUTH_REQUEST_TIMEOUT");
        if (authError) throw authError;
        setSession(data.session);
        setMessage("登录成功。");
      }
      setPassword("");
    } catch (authError) {
      setError(authError instanceof Error && authError.message === "AUTH_REQUEST_TIMEOUT"
        ? "认证服务请求超时，请重试。"
        : authError instanceof Error ? authError.message : "身份验证失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: authError } = await withTimeout(supabase.auth.signOut(), 15_000, "AUTH_REQUEST_TIMEOUT");
      if (authError) throw authError;
      setSession(null);
      setMessage("已退出登录。");
    } catch (authError) {
      setError(authError instanceof Error && authError.message === "AUTH_REQUEST_TIMEOUT"
        ? "退出请求超时，请重试。"
        : authError instanceof Error ? authError.message : "退出失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-800">账号</h2>
      {!supabase ? (
        <p className="mt-2 text-sm text-amber-800">
          尚未配置 Supabase。按项目根目录的 <code>.env.example</code> 设置项目 URL 和 Publishable Key 后，重新构建部署即可启用登录。
        </p>
      ) : checkingSession ? (
        <p className="mt-2 text-sm text-slate-500" role="status">正在恢复登录状态…</p>
      ) : session ? (
        <div className="mt-3">
          <p className="text-sm text-slate-700">已登录：{session.user.email ?? session.user.id}</p>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={busy}
            className="mt-3 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "处理中…" : "退出登录"}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => { setMode("sign_in"); setMessage(""); setError(""); }} className={`rounded-lg py-2 text-sm ${mode === "sign_in" ? "bg-white font-semibold text-brand-800 shadow-sm" : "text-slate-600"}`}>登录</button>
            <button type="button" onClick={() => { setMode("sign_up"); setMessage(""); setError(""); }} className={`rounded-lg py-2 text-sm ${mode === "sign_up" ? "bg-white font-semibold text-brand-800 shadow-sm" : "text-slate-600"}`}>注册</button>
          </div>
          <form className="mt-3 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
            <label className="block text-sm">
              <span className="text-slate-600">邮箱</span>
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-600" />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">密码</span>
              <input type="password" autoComplete={mode === "sign_up" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-600" />
            </label>
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-brand-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "请稍候…" : mode === "sign_up" ? "创建账号" : "登录"}
            </button>
          </form>
        </>
      )}
      {message && <p className="mt-3 text-sm text-brand-800" role="status">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      {sessionRestoreFailed && <button type="button" onClick={() => setSessionRetry((retry) => retry + 1)} className="mt-2 text-sm font-medium text-brand-700 underline">重试恢复登录状态</button>}
    </section>
  );
}
