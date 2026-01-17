import { useState } from 'react';
import { loginWithPassword } from '../api/client';
import './Login.css';

function Login({ onLoginSuccess }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await loginWithPassword(password);
            onLoginSuccess();
        } catch (err) {
            setError(err.message || 'Incorrect password');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <img
                        src="/icons/moneywise_icon.png"
                        alt="MoneyWise"
                        className="login-logo"
                    />
                    <h1 className="login-title">MoneyWise</h1>
                    <p className="login-subtitle">Enter your password to continue</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="login-input-group">
                        <label htmlFor="password" className="login-label">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            className="login-input"
                            placeholder="Enter password..."
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                            autoComplete="current-password"
                        />
                    </div>

                    {error && (
                        <div className="login-error">
                            ❌ {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="login-button"
                        disabled={isLoading || !password}
                    >
                        {isLoading ? 'Verifying...' : '🔓 Unlock'}
                    </button>
                </form>

                <div className="login-footer">
                    Your personal finance companion
                </div>
            </div>
        </div>
    );
}

export default Login;
