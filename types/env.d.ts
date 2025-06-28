declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_SUPABASE_URL: string;
      EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
      ELEVEN_LABS_API_KEY: string;
      GOOGLE_GEMINI_API_KEY: string;
    }
  }
}

export {};