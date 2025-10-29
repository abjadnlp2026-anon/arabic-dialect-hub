import { useState } from 'react';
import { useSignIn, useSignUp } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';

interface HybridAuthFormProps {
  mode: 'signin' | 'signup';
}

export default function HybridAuthForm({ mode }: HybridAuthFormProps) {
  const { signIn, isLoaded: signInLoaded, setActive: signInSetActive } = useSignIn();
  const { signUp, isLoaded: signUpLoaded, setActive: signUpSetActive } = useSignUp();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('darija');
  const [targetLanguage, setTargetLanguage] = useState('lebanese');
  const [selectedAvatar, setSelectedAvatar] = useState(1);
  
  // Generate username preview from email
  const suggestedUsername = email ? email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [showExtendedSignup, setShowExtendedSignup] = useState(false);
  
  const languages = [
    { value: 'darija', label: '🇲🇦 Darija (Moroccan)', flag: '🇲🇦' },
    { value: 'lebanese', label: '🇱🇧 Lebanese', flag: '🇱🇧' },
    { value: 'syrian', label: '🇸🇾 Syrian', flag: '🇸🇾' },
    { value: 'emirati', label: '🇦🇪 Emirati', flag: '🇦🇪' },
    { value: 'saudi', label: '🇸🇦 Saudi', flag: '🇸🇦' }
  ];
  
  const avatarOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInLoaded || !signIn) return;
    
    setError('');
    setIsLoading(true);
    
    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });
      
      if (result.status === 'complete') {
        await signInSetActive({ session: result.createdSessionId });
        navigate('/hub');
      }
    } catch (err: any) {
      console.error('[Auth] Sign in error:', err);
      setError(err.errors?.[0]?.message || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // For signup, show extended form first if not shown
    if (!showExtendedSignup) {
      setShowExtendedSignup(true);
      return;
    }
    
    if (!signUpLoaded || !signUp) return;
    
    // Validate language selection
    if (sourceLanguage === targetLanguage) {
      setError('Please select different source and target languages');
      return;
    }
    
    setError('');
    setIsLoading(true);
    
    try {
      // Use consistent avatar URL format (same as in AuthContext)
      const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=avatar${selectedAvatar}`;
      
      // Use provided username or generate one
      const finalUsername = username.trim() || (suggestedUsername + Math.floor(Math.random() * 1000));
      console.log('[Auth] Creating account with username:', finalUsername);
      
      const result = await signUp.create({
        emailAddress: email,
        password,
        username: finalUsername, // User-provided or auto-generated
        unsafeMetadata: {
          sourceLanguage,
          targetLanguage,
          avatarUrl,
          avatarId: selectedAvatar
        }
      });
      
      console.log('[Auth] Signup result:', result.status, result);
      console.log('[Auth] Required fields:', result.requiredFields);
      console.log('[Auth] Missing fields:', result.missingFields);
      
      // Check the status and handle accordingly
      if (result.status === 'complete') {
        // No verification needed, sign in immediately
        console.log('[Auth] Signup complete, setting active session');
        
        // Update public metadata for syncing
        try {
          await result.update({
            unsafeMetadata: {
              sourceLanguage,
              targetLanguage,
              avatarUrl
            }
          });
        } catch (err) {
          console.warn('[Auth] Could not update public metadata:', err);
        }
        
        await signUpSetActive({ session: result.createdSessionId });
        navigate('/hub');
      } else if (result.status === 'missing_requirements') {
        // Check what's missing
        console.log('[Auth] Missing requirements:', result.requiredFields);
        console.log('[Auth] Verification methods:', result.verifications);
        
        // Check if it's just email verification
        if (result.requiredFields?.length === 1 && 
            result.requiredFields[0] === 'email_address_verification') {
          // Try to complete without verification if disabled in Clerk
          try {
            // First try to set active session directly
            if (result.createdSessionId) {
              await signUpSetActive({ session: result.createdSessionId });
              navigate('/hub');
              return;
            }
          } catch (err) {
            console.log('[Auth] Could not bypass verification, proceeding with email verification');
          }
          
          // If we can't bypass, do email verification
          await result.prepareEmailAddressVerification({
            strategy: 'email_code'
          });
          setPendingVerification(true);
          setError('');
        } else if (result.requiredFields?.includes('captcha_challenge')) {
          // CAPTCHA is required but we don't want it
          console.error('[Auth] CAPTCHA is required by Clerk. Please disable bot protection in Clerk dashboard.');
          setError('Bot protection is enabled. Please try again or contact support.');
        } else {
          // Other missing requirements
          console.error('[Auth] Missing fields:', result.requiredFields);
          setError(`Missing required fields: ${result.requiredFields?.join(', ')}`);
        }
      }
    } catch (err: any) {
      console.error('[Auth] Sign up error:', err);
      setError(err.errors?.[0]?.message || 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpLoaded || !signUp) return;
    
    setError('');
    setIsLoading(true);
    
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });
      
      if (result.status === 'complete') {
        await signUpSetActive({ session: result.createdSessionId });
        navigate('/hub');
      }
    } catch (err: any) {
      console.error('[Auth] Verification error:', err);
      setError(err.errors?.[0]?.message || 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }
    
    if (!signInLoaded || !signIn) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      
      // Show success message
      setError('');
      alert(`Password reset instructions have been sent to ${email}`);
    } catch (err: any) {
      console.error('[Auth] Password reset error:', err);
      setError(err.errors?.[0]?.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  // Show verification form if pending
  if (pendingVerification) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-white rounded-xl shadow-2xl">
        <h2 className="text-2xl font-bold mb-6 text-center">Verify Your Email</h2>
        <p className="text-gray-600 mb-6 text-center">
          We've sent a verification code to <strong>{email}</strong>
        </p>
        
        <form onSubmit={handleVerification} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
              Verification Code
            </label>
            <input
              type="text"
              id="code"
              name="code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter 6-digit code"
              required
              autoFocus
              autoComplete="one-time-code"
            />
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Verifying...' : 'Verify Email'}
          </button>
          
          <button
            type="button"
            onClick={() => {
              setPendingVerification(false);
              setVerificationCode('');
              setError('');
            }}
            className="w-full py-2 text-gray-600 hover:text-gray-800 text-sm"
          >
            ← Back to sign up
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-white rounded-xl shadow-2xl">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900">
          {mode === 'signin' ? 'Welcome Back' : 'Get Started'}
        </h2>
        <p className="text-gray-600 mt-2">
          {mode === 'signin' 
            ? 'Sign in to continue learning' 
            : 'Create your account to start learning Arabic dialects'}
        </p>
      </div>
      

      
      {/* Email/Password Form */}
      <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="you@example.com"
            required
          />
        </div>
        
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => handleForgotPassword()}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Forgot password?
              </button>
            )}
          </div>
          <input
            type="password"
            id="password"
            name="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={mode === 'signin' ? 'Enter your password' : 'Create a strong password'}
            required
            minLength={8}
          />
          {mode === 'signup' && (
            <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters</p>
          )}
        </div>
        
        {/* Extended signup fields */}
        {mode === 'signup' && showExtendedSignup && (
          <>
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">Set up your learning profile</h3>
              
              {/* Username field - shown but auto-filled */}
              <div>
                <label htmlFor="username-extended" className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  id="username-extended"
                  name="username"
                  autoComplete="off"
                  value={username || suggestedUsername}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
                  placeholder={suggestedUsername || "Your username"}
                />
                <p className="mt-1 text-xs text-gray-500">
                  This will be your unique identifier in the app
                </p>
              </div>
              
              {/* Language Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sourceLanguage" className="block text-sm font-medium text-gray-700 mb-2">
                    I speak
                  </label>
                  <select
                    id="sourceLanguage"
                    name="sourceLanguage"
                    value={sourceLanguage}
                    onChange={(e) => setSourceLanguage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {languages.map(lang => (
                      <option key={lang.value} value={lang.value}>
                        {lang.flag} {lang.label.split(' ')[1]}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label htmlFor="targetLanguage" className="block text-sm font-medium text-gray-700 mb-2">
                    I want to learn
                  </label>
                  <select
                    id="targetLanguage"
                    name="targetLanguage"
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {languages.map(lang => (
                      <option key={lang.value} value={lang.value}>
                        {lang.flag} {lang.label.split(' ')[1]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Avatar Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Choose your avatar
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {avatarOptions.map(num => {
                    // Use consistent avatar format
                    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=avatar${num}`;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSelectedAvatar(num)}
                        className={`p-1 rounded-lg border-2 transition ${
                          selectedAvatar === num 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <img 
                          src={avatarUrl}
                          alt={`Avatar ${num}`}
                          className="w-full h-full rounded"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
        
        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}
        
        
        <button
          type="submit"
          disabled={isLoading || (mode === 'signin' ? !signInLoaded : !signUpLoaded)}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Loading...' : 
           mode === 'signin' ? 'Sign In' : 
           !showExtendedSignup ? 'Continue' : 'Create Account'}
        </button>
      </form>
      
      <div className="mt-6 text-center">
        <p className="text-sm text-gray-600">
          {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
          <a
            href={mode === 'signin' ? '/signup' : '/login'}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </a>
        </p>
      </div>
    </div>
  );
}