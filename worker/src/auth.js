// Only the owner may use the Worker: the page sends its Firebase ID token, we check Google's signature,
// the project (issuer/audience) and that the uid is the owner's. Anyone else gets 403.
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export async function ownerFromRequest(request, env) {
  const m = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '');
  if (!m) return { ok: false, why: 'no token' };
  const token = m[1];
  // local development only (`wrangler dev` with DEV_EMULATOR=1 in .dev.vars): the Firebase emulator signs nothing
  if (env.DEV_EMULATOR === '1') {
    try { const p = decodeJwt(token); return p.sub === env.OWNER_UID || p.user_id === env.OWNER_UID ? { ok: true, uid: p.sub } : { ok: false, why: 'not owner' }; }
    catch (e) { return { ok: false, why: 'bad token' }; }
  }
  try {
    const { payload } = await jwtVerify(token, env.JWKS || JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT}`, audience: env.FIREBASE_PROJECT, algorithms: ['RS256'] });
    return payload.sub === env.OWNER_UID ? { ok: true, uid: payload.sub } : { ok: false, why: 'not owner' };
  } catch (e) { return { ok: false, why: 'bad token' }; }
}
