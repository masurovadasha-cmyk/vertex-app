const ref=/^[a-z0-9]{20}$/;
const key=/^sb_publishable_[A-Za-z0-9_-]+$/;

export function publicAuthConfig(env){
  const projectRef=env?.SUPABASE_STAGING_REF||'';
  const url=env?.SUPABASE_URL||'';
  const publishableKey=env?.SUPABASE_PUBLISHABLE_KEY||'';
  if(!ref.test(projectRef)||url!==`https://${projectRef}.supabase.co`||!key.test(publishableKey))return null;
  return Object.freeze({
    provider:'supabase',
    environment:'staging',
    url,
    publishableKey,
    passwordGrant:true,
    persistence:'memory-only'
  });
}
