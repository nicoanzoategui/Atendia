import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Setting all relevant sessions to draft...');
  
  const r1 = await supabase.from('class_session')
    .update({ status: 'draft' })
    .in('id', ['50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003']);
    
  console.log('Result:', r1.error ? r1.error : 'OK');
  console.log('Status updated successfully.');
}

main().catch(console.error);
