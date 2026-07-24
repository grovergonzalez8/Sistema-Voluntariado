# Migraciones

Las migraciones SQL se ejecutan en orden por nombre. Una migración integrada es inmutable; cualquier corrección posterior se expresa en un archivo nuevo. Toda tabla expuesta requiere RLS, grants explícitos y pruebas en `supabase/tests`.
