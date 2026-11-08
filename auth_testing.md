# Auth testing (ICEPOPS — PostgreSQL, not MongoDB)

- Email/password: POST /api/auth/register {name,email,phone(10-digit Indian),password>=8} or /api/auth/login → sets cookie `icepops_session`.
- Google (Emergent-managed): button redirects to https://auth.emergentagent.com/?redirect=<origin>/ ; app returns with #session_id=...; frontend POSTs /api/auth/google/session {session_id}; backend calls Emergent session-data and creates its own session. Cannot be fully automated; verify redirect URL only.
- Sessions stored hashed (sha256) in Postgres table `sessions`; 7-day expiry.
- All unsafe methods need header `X-CSRF-Guard: 1`.
- Verify: GET /api/auth/me returns user with roles; /admin requires role admin (403 otherwise); customers can't read other customers' orders (404).
