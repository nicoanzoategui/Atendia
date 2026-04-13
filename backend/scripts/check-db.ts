import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
      .from('attendance_record')
      .upsert({
        class_session_id: '50000000-0000-0000-0000-000000000001',
        student_id: '20000000-0000-0000-0000-000000000001',
        status: 'present',
        method: 'admin',
        recorded_by_actor_type: 'teacher',
        recorded_by_actor_id: '10000000-0000-0000-0000-000000000001',
        device_timestamp: new Date().toISOString(),
        sync_status: 'synced'
      }, { onConflict: 'class_session_id,student_id' })
      .select()
      .single();
      
  console.log('Error:', error);
  console.log('Success:', data);
}

main().catch(console.error);
