import { useState } from "react";
import { setAccessToken } from "@/lib/api";
import { Eye, EyeOff } from "lucide-react";

type Props = {
  onLoginSuccess: () => void;
  isChecking: boolean;
};

export default function LoginScreen({ onLoginSuccess, isChecking }: Props) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

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
          <div className="spinner"></div>
          <p>Đang kết nối...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <h1>Đăng nhập</h1>
        <p className="login-subtitle">Nhập thông tin truy cập hệ thống InfraRender AI</p>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="login-user" className="sr-only">Tài khoản</label>
            <input
              id="login-user"
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              disabled={loading}
              autoComplete="off"
              placeholder="Tên đăng nhập"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-pass" className="sr-only">Mật khẩu</label>
            <div className="input-with-icon">
              <input
                id="login-pass"
                type={showPass ? "text" : "password"}
                value={pass}
                onChange={e => setPass(e.target.value)}
                disabled={loading}
                autoComplete="new-password"
                placeholder="Mật khẩu"
              />
              <button 
                type="button" 
                className="icon-btn" 
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                tabIndex={-1}
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="login-actions">
            <label className="remember-me">
              <input type="checkbox" defaultChecked />
              <span>Ghi nhớ tôi</span>
            </label>
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
