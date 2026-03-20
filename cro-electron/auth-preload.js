// Runs in the Google auth popup before any page JS.
// Stubs out the WebAuthn credentials API so Google falls back to password auth.
Object.defineProperty(navigator, 'credentials', {
  get: () => ({
    get:                () => Promise.reject(new Error('WebAuthn not available')),
    create:             () => Promise.reject(new Error('WebAuthn not available')),
    store:              () => Promise.reject(new Error('WebAuthn not available')),
    preventSilentAccess:() => Promise.resolve(),
  }),
  configurable: true,
});
try { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true }); } catch(e) {}
