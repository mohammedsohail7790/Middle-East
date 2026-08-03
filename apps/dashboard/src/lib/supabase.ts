import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./supabase-env";

export const supabase = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
