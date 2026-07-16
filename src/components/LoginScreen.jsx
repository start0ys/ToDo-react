import './login.css';

export default function LoginScreen({ onLogin }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">🗓️</div>
        <h1 className="login-title">ToDo Calendar</h1>
        <p className="login-desc">로그인하고 내 일정과 할 일을 관리하세요.</p>
        <button className="login-google-btn" onClick={onLogin}>
          <span className="login-google-icon">G</span>
          Google로 로그인
        </button>
      </div>
    </div>
  );
}
