import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';

export function useRealtimeAttendance(sessionId: string, initialData: any[]) {
  const [attendance, setAttendance] = useState<any[]>(initialData);

  useEffect(() => {
    setAttendance([]);
  }, [sessionId]);

  useEffect(() => {
    if (attendance.length === 0 && initialData.length > 0) {
      setAttendance(initialData);
    }
  }, [initialData, attendance.length]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`attendance:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_record',
          filter: `class_session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setAttendance((prev) => {
              const index = prev.findIndex((a) => a.student_id === payload.new.student_id);
              if (index !== -1) {
                const next = [...prev];
                next[index] = payload.new;
                return next;
              }
              return [...prev, payload.new];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return attendance;
}
