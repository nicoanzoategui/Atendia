import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Adding students to sessions...');
  
  const { data: sessions } = await supabase.from('class_session').select('id');
  if (!sessions) return;

  const studentIds = [
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000006',
    '20000000-0000-0000-0000-000000000007',
    '20000000-0000-0000-0000-000000000008',
    '20000000-0000-0000-0000-000000000009',
    '20000000-0000-0000-0000-000000000010'
  ];

  for (const session of sessions) {
    const records = studentIds.map((sid, index) => ({
      class_session_id: session.id,
      student_id: sid,
      student_external_id: `S-${(index + 1).toString().padStart(3, '0')}`
    }));

    await supabase.from('class_session_student').delete().eq('class_session_id', session.id);
    const { error } = await supabase.from('class_session_student').insert(records);
    if (error) console.error(`Error in session ${session.id}:`, error.message);
    else console.log(`Session ${session.id} updated with students.`);
  }

  console.log('Done.');
}

main().catch(console.error);
