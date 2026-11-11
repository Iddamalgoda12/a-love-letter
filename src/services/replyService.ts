import { supabase } from './supabase';
export async function sendReply(message: string, website: string) {
  if (!supabase) throw new Error('Replies are not configured yet. Please try again later.');
  const { data, error } = await supabase.functions.invoke('submit-reply', { body: { message, website } });
  if (error || !data?.ok) throw new Error(data?.error || 'Your message could not be sent. Please try again.');
}
