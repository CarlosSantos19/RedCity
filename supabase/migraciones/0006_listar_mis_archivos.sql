-- =====================================================================
-- RedCity · Migración 0006
-- Cada vecino puede LISTAR los archivos de su propia carpeta (publicaciones y avatares).
-- Sin esto, al eliminar la cuenta la app no encontraba sus fotos para borrarlas.
-- Ejecutar UNA vez en Supabase → SQL Editor, después de 0005.
-- =====================================================================
create policy "listar mis archivos" on storage.objects for select to authenticated
  using (bucket_id in ('publicaciones', 'avatares') and (storage.foldername(name))[1] = auth.uid()::text);
