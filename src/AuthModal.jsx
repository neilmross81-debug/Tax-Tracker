import React, { useState } from 'react';
import { auth } from './firebase';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from 'firebase/auth';

export default function AuthModal() {
    const [mode, setMode] = useState('login'); // 'login' | 'signup'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (mode === 'signup' && password !== confirm) {
            setError('Passwords do not match.');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }

        setLoading(true);
        try {
            if (mode === 'signup') {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (err) {
            const messages = {
                'auth/email-already-in-use': 'An account with this email already exists.',
                'auth/user-not-found': 'No account found with this email.',
                'auth/wrong-password': 'Incorrect password.',
                'auth/invalid-email': 'Please enter a valid email address.',
                'auth/invalid-credential': 'Incorrect email or password.',
                'auth/too-many-requests': 'Too many attempts. Please try again later.',
            };
            setError(messages[err.code] || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'radial-gradient(ellipse at top, #1a1f3e 0%, #0a0d1a 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
        }}>
            {/* Background decorative circles */}
            <div style={{ position: 'absolute', top: '-10rem', right: '-10rem', width: '40rem', height: '40rem', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.08)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '-8rem', left: '-8rem', width: '30rem', height: '30rem', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.06)', pointerEvents: 'none' }} />

            <div style={{
                background: 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '1.5rem',
                padding: '2.5rem',
                width: '100%',
                maxWidth: '400px',
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                position: 'relative',
            }}>
                {/* Logo / Title */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: '3.5rem', height: '3.5rem', borderRadius: '1rem',
                        background: 'linear-gradient(135deg, var(--primary) 0%, #818cf8 100%)',
                        margin: '0 auto 1rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.5rem', fontWeight: 'bold', color: 'white',
                    }}>T</div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>TaxTracker</h1>
                    <p style={{ margin: '0.25rem 0 0', opacity: 0.55, fontSize: '0.85rem' }}>UK Professional Grade</p>
                </div>

                {/* Tab switcher */}
                <div style={{
                    display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: '0.75rem',
                    padding: '0.25rem', marginBottom: '1.5rem',
                }}>
                    {['login', 'signup'].map(m => (
                        <button
                            key={m}
                            onClick={() => { setMode(m); setError(''); }}
                            style={{
                                flex: 1, padding: '0.6rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer',
                                fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s',
                                background: mode === m ? 'var(--primary)' : 'transparent',
                                color: mode === m ? 'white' : 'rgba(255,255,255,0.5)',
                            }}
                        >
                            {m === 'login' ? 'Sign In' : 'Create Account'}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.8rem', opacity: 0.65, display: 'block', marginBottom: '0.4rem' }}>Email address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            placeholder="you@example.com"
                            className="input-field"
                            style={{ width: '100%', boxSizing: 'border-box' }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', opacity: 0.65, display: 'block', marginBottom: '0.4rem' }}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            placeholder="Min. 6 characters"
                            className="input-field"
                            style={{ width: '100%', boxSizing: 'border-box' }}
                        />
                    </div>

                    {mode === 'signup' && (
                        <div>
                            <label style={{ fontSize: '0.8rem', opacity: 0.65, display: 'block', marginBottom: '0.4rem' }}>Confirm password</label>
                            <input
                                type="password"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                required
                                placeholder="Repeat password"
                                className="input-field"
                                style={{ width: '100%', boxSizing: 'border-box' }}
                            />
                        </div>
                    )}

                    {error && (
                        <div style={{
                            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                            borderRadius: '0.5rem', padding: '0.75rem 1rem',
                            color: '#fca5a5', fontSize: '0.85rem',
                        }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary"
                        style={{ padding: '0.85rem', fontSize: '0.95rem', fontWeight: 700, marginTop: '0.5rem', opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', fontSize: '0.75rem', opacity: 0.35, marginTop: '1.5rem', marginBottom: 0 }}>
                    Your data is stored securely in the cloud and syncs across all your devices.
                </p>
            </div>
        </div>
    );
}
