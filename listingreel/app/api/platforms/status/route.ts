import {NextResponse} from 'next/server';
import {requireUser} from '@/lib/supabase/server';
import {supabaseAdmin} from '@/lib/supabase/admin';

export async function GET() {
  const {user} = await requireUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  // never return tokens — only what the UI needs
  const {data} = await supabaseAdmin.from('lr_connected_accounts').select('platform,account_name,expires_at').eq('user_id', user.id);
  return NextResponse.json({accounts: data || []});
}
