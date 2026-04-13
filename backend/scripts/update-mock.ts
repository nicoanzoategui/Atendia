import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Renaming courses...');
  
  // 1. Rename 'Marketing Digital' -> 'Instalación de aire acondicionado'
  const r1 = await supabase.from('learning_proposal').update({ name: 'Instalación de aire acondicionado' }).eq('id', '30000000-0000-0000-0000-000000000001');
  console.log('Update 1:', r1.error ? r1.error : 'OK');

  // 2. Rename 'Diseño UX' -> 'Corte y confección'
  const r2 = await supabase.from('learning_proposal').update({ name: 'Instalación de aire acondicionado' }).eq('id', '30000000-0000-0000-0000-000000000002');
  console.log('Update 2:', r2.error ? r2.error : 'OK');

  console.log('Updating professor names (Editions)...');
  await supabase.from('learning_proposal_edition').update({ name: 'Roberto García' }).eq('id', '40000000-0000-0000-0000-000000000001');
  await supabase.from('learning_proposal_edition').update({ name: 'Elena Martínez' }).eq('id', '40000000-0000-0000-0000-000000000002');

  console.log('Isolating 2 classes for teacher...');
  // Delete extra classes for teacher 1
  const sessionsToDrop = [
    '50000000-0000-0000-0000-000000000002', 
    '50000000-0000-0000-0000-000000000004', 
    '50000000-0000-0000-0000-000000000005', 
    '50000000-0000-0000-0000-000000000006',
    '50000000-0000-0000-0000-000000000007',
    '50000000-0000-0000-0000-000000000008'
  ];
  
  for(const sessionId of sessionsToDrop) {
    await supabase.from('class_session_teacher')
        .delete()
        .eq('teacher_id', '10000000-0000-0000-0000-000000000001')
        .eq('class_session_id', sessionId);
  }
  
  // Add teacher to session 3 if not present
  const { data } = await supabase.from('class_session_teacher')
    .select('*')
    .eq('teacher_id', '10000000-0000-0000-0000-000000000001')
    .eq('class_session_id', '50000000-0000-0000-0000-000000000003');
    
  if (!data || data.length === 0) {
    await supabase.from('class_session_teacher').insert({
      class_session_id: '50000000-0000-0000-0000-000000000003',
      teacher_id: '10000000-0000-0000-0000-000000000001',
      teacher_external_id: 'T-001',
      role: 'titular'
    });
  }

  console.log('Update Complete.');
}

main().catch(console.error);
