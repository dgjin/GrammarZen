// Test script to check environment variables
console.log('Testing environment variables:');
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY);
console.log('VITE_API_KEY:', process.env.VITE_API_KEY);
console.log('All process.env variables:', Object.keys(process.env).filter(key => key.startsWith('VITE_')));
