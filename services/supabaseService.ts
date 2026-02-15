import { createClient } from '@supabase/supabase-js';
import { RuleLibrary, HistoryRecord, ProofreadResult } from '../types';

// Process.env is replaced by Vite at build time. 
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

// Safely initialize Supabase only if keys are present
export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// Constants for LocalStorage keys
const LOCAL_WHITELIST_KEY = 'grammarzen_whitelist';
const LOCAL_SENSITIVE_WORDS_KEY = 'grammarzen_sensitive_words';
const LOCAL_RULE_LIBS_KEY = 'grammarzen_rule_libs';

// --- Data Types for DB ---
interface UserConfig {
  whitelist: string[];
  sensitive_words: string[];
}

// --- Data Synchronization Helpers ---

/**
 * Upload User Avatar
 */
export const uploadUserAvatar = async (userId: string, file: File) => {
  if (!supabase) throw new Error("Supabase client not initialized");

  // Limit file size (e.g. 2MB)
  if (file.size > 2 * 1024 * 1024) {
      throw new Error("头像文件大小不能超过 2MB");
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}-${Date.now()}.${fileExt}`;
  
  // Upload to 'avatars' bucket
  // Ensure you have created a public bucket named 'avatars' in Supabase Dashboard
  const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, {
          upsert: true
      });

  if (uploadError) {
      if (uploadError.message.includes("Bucket not found")) {
          throw new Error("未找到 'avatars' 存储桶，请在 Supabase 后台 Storage 中创建并设为 Public。");
      }
      throw uploadError;
  }

  const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);
      
  return data.publicUrl;
};

/**
 * Update User Profile (Nickname, Avatar, Password)
 */
export const updateUserProfile = async (attrs: { nickname?: string; avatarUrl?: string; password?: string }) => {
  if (!supabase) throw new Error("Supabase client not initialized");
  
  const updates: any = {};
  
  // Password update
  if (attrs.password) {
      updates.password = attrs.password;
  }

  // Metadata update (Nickname, Avatar)
  if (attrs.nickname !== undefined || attrs.avatarUrl !== undefined) {
      updates.data = {};
      if (attrs.nickname !== undefined) updates.data.nickname = attrs.nickname;
      if (attrs.avatarUrl !== undefined) updates.data.avatar_url = attrs.avatarUrl;
  }

  // Only call API if there are updates
  if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase.auth.updateUser(updates);
      if (error) throw error;
      return data;
  }
  return null;
};

/**
 * Initialize User Configuration (Called manually or lazily)
 * Can optionally bootstrap with existing local data
 */
export const initializeUserConfig = async (userId: string, initialData?: UserConfig) => {
  if (!supabase) return;

  const payload = {
      user_id: userId,
      whitelist: initialData?.whitelist || [],
      sensitive_words: initialData?.sensitive_words || []
  };

  // Insert initial record. 
  const { error } = await supabase
    .from('grammarzen_user_configs')
    .upsert(
      payload,
      { onConflict: 'user_id', ignoreDuplicates: true }
    );
    
  if (error) {
    console.error("Failed to initialize user config:", error);
  }
};

/**
 * Load User Configuration (Whitelist & Sensitive Words)
 * Improved Logic: Auto-sync local data to cloud on first load if cloud data is missing.
 */
export const loadUserConfig = async (userId?: string): Promise<UserConfig> => {
  // 1. Prepare Local Data (needed for fallback or sync)
  let localWhitelist: string[] = [];
  let localSensitiveWords: string[] = [];
  try {
    const w = localStorage.getItem(LOCAL_WHITELIST_KEY);
    if (w) localWhitelist = JSON.parse(w);
    
    const s = localStorage.getItem(LOCAL_SENSITIVE_WORDS_KEY);
    if (s) localSensitiveWords = JSON.parse(s);
  } catch (e) {
    console.error("Local storage parse error", e);
  }

  // 2. If Logged In, try fetching from Supabase
  if (userId && supabase) {
    try {
      const { data, error } = await supabase
        .from('grammarzen_user_configs')
        .select('whitelist, sensitive_words')
        .eq('user_id', userId)
        .maybeSingle(); // Use maybeSingle to handle 0 or 1 row without throwing error

      if (error) {
        console.error("Supabase load config error:", error);
      } else if (data) {
        // Data exists in cloud, return it
        return {
          whitelist: Array.isArray(data.whitelist) ? data.whitelist : [],
          sensitive_words: Array.isArray(data.sensitive_words) ? data.sensitive_words : []
        };
      } else {
        // Cloud data missing (First login or registration sync failed).
        // Strategy: Sync local data to cloud immediately.
        console.log("No cloud config found. Syncing local data to cloud...");
        const initialConfig = { whitelist: localWhitelist, sensitive_words: localSensitiveWords };
        await initializeUserConfig(userId, initialConfig);
        // Return local data as the current state
        return initialConfig;
      }
    } catch (e) {
      console.error("Failed to load cloud config", e);
    }
  }

  // 3. Fallback / Anonymous: Return Local Data
  return { whitelist: localWhitelist, sensitive_words: localSensitiveWords };
};

/**
 * Load Rule Libraries
 */
export const loadRuleLibraries = async (userId?: string): Promise<RuleLibrary[]> => {
  // 1. If Logged In, try fetching from Supabase
  if (userId && supabase) {
    try {
      const { data, error } = await supabase
        .from('grammarzen_rule_libraries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) return data as RuleLibrary[];
    } catch (e) {
      console.error("Supabase load rules error:", e);
    }
  }

  // 2. Fallback / Anonymous: LocalStorage
  try {
    const r = localStorage.getItem(LOCAL_RULE_LIBS_KEY);
    if (r) return JSON.parse(r);
  } catch (e) {
    console.error("Local storage rules parse error", e);
  }
  return [];
};

/**
 * Save Whitelist
 */
export const saveWhitelist = async (userId: string | undefined, list: string[]) => {
  // Always save locally for redundancy/offline speed or anonymous
  localStorage.setItem(LOCAL_WHITELIST_KEY, JSON.stringify(list));

  if (userId && supabase) {
    const { error } = await supabase
      .from('grammarzen_user_configs')
      .upsert({ user_id: userId, whitelist: list }, { onConflict: 'user_id', ignoreDuplicates: false })
      .select();
      
     if(error) console.error("Cloud save whitelist error", error);
  }
};

/**
 * Save Sensitive Words
 */
export const saveSensitiveWords = async (userId: string | undefined, list: string[]) => {
  localStorage.setItem(LOCAL_SENSITIVE_WORDS_KEY, JSON.stringify(list));

  if (userId && supabase) {
    const { error } = await supabase
      .from('grammarzen_user_configs')
      .upsert({ user_id: userId, sensitive_words: list }, { onConflict: 'user_id', ignoreDuplicates: false });
      
     if(error) console.error("Cloud save sensitive words error", error);
  }
};

/**
 * Add Rule Library
 */
export const addRuleLibrary = async (userId: string | undefined, lib: RuleLibrary) => {
  // Local
  const currentLocal = await loadRuleLibraries(undefined); 
  const newLocal = [lib, ...currentLocal];
  localStorage.setItem(LOCAL_RULE_LIBS_KEY, JSON.stringify(newLocal));

  // Cloud
  if (userId && supabase) {
     const { error } = await supabase
        .from('grammarzen_rule_libraries')
        .insert({
            id: lib.id,
            user_id: userId,
            name: lib.name,
            description: lib.description,
            rules: lib.rules,
            created_at: lib.createdAt
        });
     if(error) console.error("Cloud add lib error", error);
  }
};

/**
 * Delete Rule Library
 */
export const deleteRuleLibrary = async (userId: string | undefined, libId: string) => {
    // Local
    const currentLocal = await loadRuleLibraries(undefined);
    const newLocal = currentLocal.filter(l => l.id !== libId);
    localStorage.setItem(LOCAL_RULE_LIBS_KEY, JSON.stringify(newLocal));

    // Cloud
    if (userId && supabase) {
        const { error } = await supabase
            .from('grammarzen_rule_libraries')
            .delete()
            .eq('id', libId)
            .eq('user_id', userId);
        if(error) console.error("Cloud delete lib error", error);
    }
}

// --- History Logic ---

export const saveHistoryRecord = async (userId: string, record: Omit<HistoryRecord, 'id' | 'createdAt'>) => {
  if (!supabase) return;
  
  const payload = {
    user_id: userId,
    original_text: record.originalText,
    file_name: record.fileName,
    file_type: record.fileType,
    check_mode: record.checkMode,
    summary: record.summary,
    score: record.score,
    result_json: record.resultJson
  };

  const { error } = await supabase.from('grammarzen_history').insert(payload);
  if (error) console.error("Failed to save history:", error);
};

export const loadHistory = async (userId: string): Promise<HistoryRecord[]> => {
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from('grammarzen_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Failed to load history:", error);
    return [];
  }

  return data.map((item: any) => ({
    id: item.id,
    originalText: item.original_text,
    fileName: item.file_name,
    fileType: item.file_type,
    checkMode: item.check_mode,
    summary: item.summary,
    score: item.score,
    resultJson: item.result_json,
    createdAt: item.created_at
  }));
};

export const deleteHistoryRecord = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('grammarzen_history').delete().eq('id', id);
    if (error) console.error("Failed to delete history:", error);
}