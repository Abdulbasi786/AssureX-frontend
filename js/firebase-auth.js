/**
 * firebase-auth.js
 * Email/Password authentication + user profile sync with Firestore.
 * Depends on: firebase-config.js (must be loaded first).
 */

const AuthService = {

    /** Sign up with email/password. Creates the Firestore user doc too. */
    signUp: async function (email, password, displayName) {
        const cred = await fbAuth.createUserWithEmailAndPassword(email, password);
        const user = cred.user;

        await user.updateProfile({ displayName: displayName || '' });

        // Create the users/{uid} document
        await fbDb.collection(COLLECTIONS.USERS).doc(user.uid).set({
            uid:          user.uid,
            email:        email,
            displayName:  displayName || '',
            role:         'user',
            createdAt:    FieldValue.serverTimestamp(),
            lastLoginAt:  FieldValue.serverTimestamp(),
            isActive:     true
        });

        AuthService._logSecurityEvent('signup', { email: email });
        return user;
    },

    /** Sign in with email/password. */
    signIn: async function (email, password) {
        const cred = await fbAuth.signInWithEmailAndPassword(email, password);
        await fbDb.collection(COLLECTIONS.USERS).doc(cred.user.uid).set({
            uid: cred.user.uid,
            email: cred.user.email || email,
            displayName: cred.user.displayName || '',
            lastLoginAt: FieldValue.serverTimestamp(),
            isActive: true
        }, { merge: true });
        AuthService._logSecurityEvent('login', { email: email });
        return cred.user;
    },

    /** Sign out. */
    signOut: async function () {
        AuthService._logSecurityEvent('logout', { uid: AuthService.getUid() });
        await fbAuth.signOut();
    },

    /** Current user (null if not signed in). */
    getCurrentUser: function () {
        return fbAuth.currentUser;
    },

    getUid: function () {
        return fbAuth.currentUser ? fbAuth.currentUser.uid : null;
    },

    /**
     * Observe auth state. callback(user, userDoc)
     * userDoc is the Firestore users/{uid} snapshot (may be null).
     */
    onAuthChanged: function (callback) {
        return fbAuth.onAuthStateChanged(async function (user) {
            if (!user) { callback(null, null); return; }
            const snap = await fbDb.collection(COLLECTIONS.USERS).doc(user.uid).get();
            callback(user, snap.exists ? snap.data() : null);
        });
    },

    /** Send password-reset email. */
    resetPassword: function (email) {
        return fbAuth.sendPasswordResetEmail(email);
    },

    /** Internal: write a security_events doc (fire-and-forget). */
    _logSecurityEvent: function (type, data) {
        fbDb.collection(COLLECTIONS.SECURITY_EVENTS).add({
            type:      type,
            uid:       AuthService.getUid(),
            userAgent: navigator.userAgent,
            ip:        null, // set server-side if you add Cloud Functions later
            data:      data || {},
            timestamp: FieldValue.serverTimestamp()
        }).catch(function (e) { console.warn('[Auth] security event failed:', e); });
    }
};
