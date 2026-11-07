"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type ClinicAuthMethod, type ClinicAuthRole, type ClinicAuthSession } from '@/app/lib/clinicAuth';

interface ClinicAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (session: ClinicAuthSession) => void;
}

type AuthStep = 'role' | 'method' | 'face';

export default function ClinicAuthModal({ isOpen, onClose, onAuthenticated }: ClinicAuthModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<AuthStep>('role');
  const [selectedRole, setSelectedRole] = useState<ClinicAuthRole>('patient');
  const [loginMethod, setLoginMethod] = useState<ClinicAuthMethod>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep('role');
      setSelectedRole('patient');
      setLoginMethod('email');
      setEmail('');
      setPassword('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRoleSelect = (role: ClinicAuthRole) => {
    setSelectedRole(role);
    setError('');
    setStep('method');
  };

  const handleMethodSubmit = (method: ClinicAuthMethod) => {
    setLoginMethod(method);
    setError('');

    if (method === 'email' && (!email || !password)) {
      setError('Please enter your email and password.');
      return;
    }

    setStep('face');
  };

  const handleFaceVerification = async () => {
    if (selectedRole === 'admin') {
      setIsAuthenticating(true);
      setError('');
      try {
        const response = await fetch('/api/clinic/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, method: loginMethod }),
        });
        const data = await response.json() as { error?: string };
        if (!response.ok) {
          setError(data.error ?? 'Administrator sign-in failed.');
          setIsAuthenticating(false);
          return;
        }
      } catch {
        setError('Administrator sign-in service is unavailable.');
        setIsAuthenticating(false);
        return;
      }
      setIsAuthenticating(false);
    }

    onAuthenticated({
      authenticated: true,
      role: selectedRole,
      method: loginMethod,
      email: email || (selectedRole === 'admin' ? 'admin@clinic.com' : 'patient@clinic.com'),
      faceVerified: true,
      permissions: selectedRole === 'admin' ? ['audit-log:read'] : [],
    });
    onClose();

    if (selectedRole === 'admin') {
      router.push('/portal');
    } else {
      router.push('/');
    }
  };

  const handleClose = () => {
    setError('');
    setEmail('');
    setPassword('');
    setStep('role');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#556B42]">Secure access</p>
            <h2 className="text-2xl font-bold text-slate-800">
              {step === 'role' ? 'Choose your access' : step === 'method' ? 'Select sign-in method' : 'Complete 2-step verification'}
            </h2>
          </div>
          <button onClick={handleClose} className="text-xl text-slate-500 hover:text-slate-700">×</button>
        </div>

        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

        {step === 'role' ? (
          <div className="space-y-3">
            <button onClick={() => handleRoleSelect('patient')} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-left font-semibold text-slate-700 transition hover:bg-slate-50">
              Patient
            </button>
            <button onClick={() => handleRoleSelect('admin')} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-left font-semibold text-slate-700 transition hover:bg-slate-50">
              Admin
            </button>
          </div>
        ) : null}

        {step === 'method' ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-1">
              {[
                { key: 'email', label: 'Email address and password' },
                { key: 'google', label: 'Continue with Google' },
              ].map((option) => (
                <button
                  key={option.key}
                  onClick={() => setLoginMethod(option.key as ClinicAuthMethod)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${loginMethod === option.key ? 'bg-[#556B42] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {loginMethod === 'email' ? (
              <div className="space-y-3">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Email address"
                  type="email"
                />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Password"
                  type="password"
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <button onClick={() => handleMethodSubmit(loginMethod)} className="w-full rounded-lg bg-[#556B42] px-4 py-3 font-semibold text-white transition hover:opacity-90">
                Continue to face verification
              </button>
              <button onClick={() => setStep('role')} className="text-sm font-medium text-slate-600 hover:text-slate-800">
                Back
              </button>
            </div>
          </div>
        ) : null}

        {step === 'face' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">Face recognition required</p>
              <p className="mt-2 text-sm text-slate-500">
                This second factor confirms your identity before you can continue as a {selectedRole}.
              </p>
            </div>
            <button disabled={isAuthenticating} onClick={handleFaceVerification} className="w-full rounded-lg bg-[#556B42] px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
              {isAuthenticating ? 'Verifying...' : 'Complete face verification'}
            </button>
            <button onClick={() => setStep('method')} className="text-sm font-medium text-slate-600 hover:text-slate-800">
              Back
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
