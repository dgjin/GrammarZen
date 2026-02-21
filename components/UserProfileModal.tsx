import React, { useState, useEffect, useRef } from 'react';
import { updateUserProfile, uploadUserAvatar } from '../services/supabaseService';
import { X, User, Lock, Mail, Camera, Loader2, LogOut, Save, CheckCircle, Upload } from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onLogout: () => void;
}

const PRESET_AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Coco',
  'https://api.dicebear.com/7.x/notionists/svg?seed=Leo',
  'https://api.dicebear.com/7.x/notionists/svg?seed=Milo'
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, onLogout }) => {
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setNickname(user.user_metadata?.nickname || '');
      setAvatarUrl(user.user_metadata?.avatar_url || '');
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    if (password && password !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的密码不一致' });
      setLoading(false);
      return;
    }

    if (password && password.length < 6) {
      setMessage({ type: 'error', text: '新密码长度至少需要6位' });
      setLoading(false);
      return;
    }

    try {
      await updateUserProfile({
        nickname: nickname.trim(),
        avatarUrl: avatarUrl.trim(),
        password: password || undefined
      });
      setMessage({ type: 'success', text: '个人信息更新成功！' });
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '更新失败，请重试' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setMessage(null);
    try {
        const publicUrl = await uploadUserAvatar(user.id, file);
        setAvatarUrl(publicUrl);
        setMessage({ type: 'success', text: '头像上传成功，请点击保存以应用更改' });
    } catch (err: any) {
        console.error(err);
        setMessage({ type: 'error', text: err.message || '头像上传失败' });
    } finally {
        setUploading(false);
        // Reset input so same file can be selected again if needed
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
            <User className="w-5 h-5 text-brand-600" />
            个人中心
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 overflow-y-auto custom-scrollbar">
          
          {/* Status Message */}
          {message && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
              {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {message.text}
            </div>
          )}

          {/* Avatar Section */}
          <div className="mb-6 flex flex-col items-center">
            {/* Hidden File Input */}
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                accept="image/jpeg,image/png,image/gif,image/webp" 
                className="hidden" 
            />

            <div 
                className="relative group cursor-pointer mb-3"
                onClick={() => !uploading && fileInputRef.current?.click()}
                title="点击上传图片"
            >
               <div className="w-24 h-24 rounded-full border-4 border-slate-100 overflow-hidden shadow-sm bg-brand-50 flex items-center justify-center text-3xl font-bold text-brand-300 relative">
                  {uploading ? (
                      <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                  ) : (
                    avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        user.email?.charAt(0).toUpperCase()
                    )
                  )}
               </div>
               
               {!uploading && (
                   <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-medium backdrop-blur-[1px]">
                      <Upload className="w-4 h-4 mb-1" />
                      点击上传
                   </div>
               )}
            </div>

            <div className="flex gap-2 justify-center mb-2">
               {PRESET_AVATARS.map((url, idx) => (
                  <button 
                    key={idx} 
                    type="button" 
                    onClick={() => setAvatarUrl(url)}
                    className={`w-8 h-8 rounded-full overflow-hidden border-2 transition-all ${avatarUrl === url ? 'border-brand-500 scale-110' : 'border-transparent hover:border-slate-300'}`}
                  >
                    <img src={url} alt={`Preset ${idx}`} className="w-full h-full object-cover" />
                  </button>
               ))}
            </div>
            <div className="w-full relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Camera className="h-4 w-4 text-slate-400" />
                </div>
                <input 
                    type="text" 
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="或输入头像图片 URL..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 text-slate-600 bg-slate-50 focus:bg-white transition-colors"
                />
            </div>
        
          </div>

          <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">账号邮箱</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-4 w-4 text-slate-400" />
                    </div>
                    <input 
                        type="text" 
                        value={user.email} 
                        disabled 
                        className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-500 text-sm cursor-not-allowed"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">昵称</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-4 w-4 text-slate-400" />
                    </div>
                    <input 
                        type="text" 
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="设置一个好听的昵称"
                        className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none transition-shadow"
                    />
                </div>
            </div>

            <div className="pt-4 border-t border-slate-100 mt-4">
                <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1">
                    <Lock className="w-4 h-4 text-slate-500" /> 修改密码
                </h4>
                <div className="space-y-3">
                    <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="新密码 (至少6位，留空不修改)"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none text-sm"
                        minLength={6}
                        autoComplete="new-password"
                    />
                    <input 
                        type="password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="确认新密码"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none text-sm"
                        minLength={6}
                        autoComplete="new-password"
                    />
                </div>
            </div>
          </div>

          <div className="mt-8 flex gap-3">
             <button
                type="button"
                onClick={onLogout}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
             >
                <LogOut className="w-4 h-4" />
                退出登录
             </button>
             <button
                type="submit"
                disabled={loading || uploading}
                className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
             >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存修改
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};