import React, { useState } from 'react';
import { supabase, initializeUserConfig } from '../services/supabaseService';
import { X, Mail, Lock, Loader2, LogIn, UserPlus } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
        setError("未配置 Supabase 服务，无法登录。请检查 .env 配置。");
        return;
    }
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        alert("登录成功！");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        
        // 场景 1: Supabase 后台已关闭 "Confirm email" (推荐本地部署使用)
        if (data.user && data.session) {
          await initializeUserConfig(data.user.id);
          alert("注册成功并已自动登录！");
        } 
        // 场景 2: Supabase 后台开启了 "Confirm email" (默认设置)
        else if (data.user && !data.session) {
          alert("注册成功！\n\n注意：未检测到自动登录会话。\n请前往 Supabase 后台 (Authentication -> Providers -> Email) 关闭 'Confirm email' 选项以跳过邮箱验证，或者前往邮箱点击激活链接。");
          // 此时不关闭模态框，让用户看清提示
          setLoading(false);
          return; 
        }
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
            {isLogin ? <LogIn className="w-5 h-5 text-brand-600" /> : <UserPlus className="w-5 h-5 text-brand-600" />}
            {isLogin ? '用户登录' : '注册账号'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">电子邮箱</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                placeholder="••••••••"
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLogin ? '登录' : '注册'}
          </button>

          <div className="text-center text-sm text-slate-500 mt-4">
            {isLogin ? '还没有账号？' : '已有账号？'}
            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setError(null); }}
              className="ml-1 text-brand-600 hover:underline font-medium"
            >
              {isLogin ? '去注册' : '去登录'}
            </button>
          </div>
          
          <div className="mt-4 p-3 bg-slate-50 rounded text-xs text-slate-500 leading-relaxed border border-slate-100">
             <strong>本地部署提示：</strong> 如需免邮箱验证直接注册登录，请确保在 Supabase 后台 (Authentication &gt; Providers &gt; Email) 已关闭 <b>Confirm email</b> 选项。
          </div>
        </form>
      </div>
    </div>
  );
};