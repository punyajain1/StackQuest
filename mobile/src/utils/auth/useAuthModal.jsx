import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { useAuthStore, useAuthModal } from './store';
import api from '../api';

/**
 * This component renders a native modal for authentication.
 * Integrates directly with the backend API.
 */
export const AuthModal = () => {
  const { isOpen, mode, close, open } = useAuthModal(); // mode: 'signin' or 'signup'
  const { auth, setAuth } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isSignup = mode === 'signup';

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setUsername('');
    setError(null);
  };

  const handleToggleMode = () => {
    resetForm();
    open({ mode: isSignup ? 'signin' : 'signup' });
  };

  const handleSubmit = async () => {
    if (!email || !password || (isSignup && !username)) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let data;
      if (isSignup) {
        data = await api.Auth.register({ email, password, username });
      } else {
        data = await api.Auth.login({ email, password });
      }

      if (data && (data.token || data.jwt)) {
        setAuth({ jwt: data.token || data.jwt, user: data.user, refreshToken: data.refreshToken });
        resetForm();
        close();
      } else {
        setError('Authentication failed. No token received.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.Auth.guest();
      if (data && (data.token || data.jwt)) {
        setAuth({ jwt: data.token || data.jwt, user: data.user, refreshToken: data.refreshToken });
        resetForm();
        close();
      } else {
        setError('Guest login failed. No token received.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred logging in as a guest.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    close();
  };

  if (!isOpen || auth) return null;

  return (
    <Modal visible={true} transparent={true} animationType="slide">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: '#000' }}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 32, fontWeight: 'bold', marginBottom: 8 }}>
              {isSignup ? 'Create Account' : 'Welcome Back'}
            </Text>
            <Text style={{ color: '#aaa', fontSize: 16, marginBottom: 32 }}>
              {isSignup ? 'Join StackQuest and start your journey.' : 'Log in to continue your quest.'}
            </Text>

            {error ? (
              <View style={{ backgroundColor: 'rgba(255, 51, 51, 0.2)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <Text style={{ color: '#ff6666' }}>{error}</Text>
              </View>
            ) : null}

            {isSignup && (
              <TextInput
                style={{ backgroundColor: '#111', color: '#fff', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#333' }}
                placeholder="Username"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
              />
            )}

            <TextInput
              style={{ backgroundColor: '#111', color: '#fff', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#333' }}
              placeholder="Email"
              placeholderTextColor="#666"
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />

            <TextInput
              style={{ backgroundColor: '#111', color: '#fff', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#333' }}
              placeholder="Password"
              placeholderTextColor="#666"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity 
              onPress={handleSubmit} 
              disabled={loading}
              style={{ backgroundColor: '#4a90e2', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                  {isSignup ? 'Sign Up' : 'Log In'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={handleGuest} 
              disabled={loading}
              style={{ backgroundColor: '#222', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 32 }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Play as Guest</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
              <Text style={{ color: '#aaa', fontSize: 14 }}>
                {isSignup ? 'Already have an account? ' : "Don't have an account? "}
              </Text>
              <TouchableOpacity onPress={handleToggleMode} disabled={loading}>
                <Text style={{ color: '#4a90e2', fontSize: 14, fontWeight: 'bold' }}>
                  {isSignup ? 'Log In' : 'Sign Up'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleClose} disabled={loading} style={{ alignItems: 'center', marginTop: 32 }}>
              <Text style={{ color: '#666', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default useAuthModal;