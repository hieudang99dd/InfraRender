import { useState, useEffect } from "react";
import { setAccessToken } from "@/lib/api";
import { Eye, EyeOff, Box } from "lucide-react";

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
  const [delayMessage, setDelayMessage] = useState("");

  useEffect(() => {
    let timer1: NodeJS.Timeout;
    let timer2: NodeJS.Timeout;
    if (isChecking) {
      timer1 = setTimeout(() => {
        setDelayMessage("Đang kiểm tra dịch vụ và phiên đăng nhập...");
      }, 2000);
      timer2 = setTimeout(() => {
        setDelayMessage("Máy chủ đang khởi động. Quá trình này có thể mất thêm vài giây.");
      }, 7000);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDelayMessage("");
    }
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isChecking]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user.trim() || !pass.trim()) {
      setError("Vui lòng nhập tài khoản và mật khẩu.");
      return;
    }
    setError("");
    setLoading(true);
    
    const basicHeader = `Basic ${btoa(`${user}:${pass}`)}`;
    setAccessToken(basicHeader);

    try {
      const { apiRequest } = await import("@/lib/api");
      await apiRequest("/api/health");
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tài khoản hoặc mật khẩu không đúng.");
      setAccessToken(""); 
    } finally {
      setLoading(false);
    }
  }

  if (isChecking) {
    return (
      <div className="login-screen">
        <div className="login-box checking">
          <div className="login-brand" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: 'var(--accent)' }}>
            <Box size={40} strokeWidth={1.5} />
          </div>
          <div className="spinner"></div>
          <p style={{ fontWeight: 500 }}>Đang kết nối Render Engine…</p>
          {delayMessage && <p className="login-delay-msg" style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.5rem', textAlign: 'center' }}>{delayMessage}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-brand" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: 'var(--foreground)' }}>
          <Box size={48} strokeWidth={1.5} />
        </div>
        <h1>Đăng nhập</h1>
        <p className="login-subtitle">Nhập thông tin truy cập hệ thống</p>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="login-user" className="sr-only">Tài khoản</label>
            <input
              id="login-user"
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              disabled={loading}
              autoComplete="username"
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
                autoComplete="current-password"
                placeholder="Mật khẩu"
              />
              <button 
                type="button" 
                className="icon-btn" 
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <p className="login-error" role="alert">{error}</p>}
          
          <button type="submit" className="button button-primary login-btn" disabled={loading} style={{ marginTop: '1rem' }}>
            {loading ? "Đang xử lý..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
