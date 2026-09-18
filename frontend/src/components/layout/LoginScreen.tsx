import { useState } from "react";
import { setAccessToken } from "@/lib/api";

type Props = {
  onLoginSuccess: () => void;
  isChecking: boolean;
};

export default function LoginScreen({ onLoginSuccess, isChecking }: Props) {
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user.trim() || !pass.trim()) {
      setError("Vui lòng nhập tài khoản và mật khẩu.");
      return;
    }
    setError("");
    setLoading(true);
    
    // Store as Basic Auth format
    const basicHeader = `Basic ${btoa(`${user}:${pass}`)}`;
    setAccessToken(basicHeader);

    try {
      // Validate with backend
      const { apiRequest } = await import("@/lib/api");
      await apiRequest("/api/health");
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tài khoản hoặc mật khẩu không đúng.");
      setAccessToken(""); // clear on failure
    } finally {
      setLoading(false);
    }
  }

  if (isChecking) {
    return (
      <div className="login-screen">
        <div className="login-box checking">
          <p>Đang kiểm tra kết nối...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <h1>InfraRender AI</h1>
        <p className="login-subtitle">Đăng nhập để tiếp tục</p>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="login-user">Tài khoản</label>
            <input
              id="login-user"
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              disabled={loading}
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-pass">Mật khẩu</label>
            <input
              id="login-pass"
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              autoFocus
            />
          </div>

          {error && <p className="login-error" role="alert">{error}</p>}
          
          <button type="submit" className="button button-primary login-btn" disabled={loading}>
            {loading ? "Đang xử lý..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
