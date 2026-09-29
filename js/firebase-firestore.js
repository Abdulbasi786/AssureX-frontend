/**
 * firebase-firestore.js
 * All Firestore CRUD for the app, mapped to your 8 collections.
 * Depends on: firebase-config.js, firebase-auth.js
 *
 * Documents use the Spark-plan Firestore chunk store; binary chunks are protected by Firestore rules.
 */

const DbService = {

    /* ============================ CLAIMS ============================ */

    /** Create a claim. Returns the new claim id. */
    createClaim: async function (claimData) {
        const uid = AuthService.getUid();
        if (!uid) throw new Error('Authentication required.');
        const ref = await fbDb.collection(COLLECTIONS.CLAIMS).add({
            userId:      uid,
            status:      'pending',          // pending | under_review | approved | rejected
            createdAt:   FieldValue.serverTimestamp(),
            updatedAt:   FieldValue.serverTimestamp(),
            ...claimData,
            userId: uid
        });
        DbService.logAudit('claim_created', { claimId: ref.id });
        try { await DbService.addNotification(uid, { title: 'Claim submitted', body: 'Your claim '+ref.id+' has been submitted and is awaiting evaluation.', type: 'claim_submission', link: 'decision.html?claimId='+encodeURIComponent(ref.id), claimId: ref.id }); } catch (e) { console.warn('[Notification] claim submission:', e); }
        if (Array.isArray(claimData.missingDocuments) && claimData.missingDocuments.length) { try { await DbService.addNotification(uid, { title: 'Missing documents', body: claimData.missingDocuments.length+' required document(s) are still missing for '+ref.id+'.', type: 'missing_documents', link: 'claims.html', claimId: ref.id }); } catch (e) {} }
        return ref.id;
    },

    /** Get claims. Pass a userId to scope to one user (null = all, for admins). */
    getClaims: async function (userId, limitCount) {
        let q = fbDb.collection(COLLECTIONS.CLAIMS);
        const uid = AuthService.getUid();
        if (userId) q = q.where('userId', '==', userId);
        else {
            let role = 'user';
            try { const profile = await fbDb.collection(COLLECTIONS.USERS).doc(uid).get(); role = profile.exists ? String(profile.data().role || 'user') : 'user'; } catch(e) {}
            if ((role === 'user' || role === 'employee')) q = q.where('userId', '==', uid);
            else if (role === 'reviewer') {
                const [a,b] = await Promise.all([
                    fbDb.collection(COLLECTIONS.CLAIMS).where('predictedDecision', '==', 'Manual Review').get(),
                    fbDb.collection(COLLECTIONS.CLAIMS).where('predictedDecision', '==', 'Manual Review Required').get()
                ]);
                const docs = new Map();
                a.docs.concat(b.docs).forEach(function(d){ docs.set(d.id,d); });
                const rows = Array.from(docs.values()).map(function(d){ return {id:d.id,...d.data()}; });
                rows.sort(function(a,b){
                    const av=a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0;
                    const bv=b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0;
                    return bv-av;
                });
                return limitCount ? rows.slice(0,limitCount) : rows;
            }
        }
        const snap = await q.get();
        const rows = snap.docs.map(function (d) { return { id: d.id, ...d.data() }; });
        rows.sort(function(a,b){
            const av=a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():a.createdAt&&a.createdAt.seconds?Number(a.createdAt.seconds)*1000:0;
            const bv=b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():b.createdAt&&b.createdAt.seconds?Number(b.createdAt.seconds)*1000:0;
            return bv-av;
        });
        return limitCount ? rows.slice(0, limitCount) : rows;
    },

    /** Live listener version of getClaims (updates UI in real time). */
    listenClaims: function (userId, callback) {
        let q = fbDb.collection(COLLECTIONS.CLAIMS).orderBy('createdAt', 'desc');
        if (userId) q = q.where('userId', '==', userId);
        return q.onSnapshot(function (snap) {
            callback(snap.docs.map(function (d) { return { id: d.id, ...d.data() }; }));
        });
    },

    getClaim: async function (claimId) {
        const snap = await fbDb.collection(COLLECTIONS.CLAIMS).doc(claimId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    },

    updateClaim: async function (claimId, updates) {
        await fbDb.collection(COLLECTIONS.CLAIMS).doc(claimId).update({
            ...updates,
            updatedAt: FieldValue.serverTimestamp()
        });
        DbService.logAudit('claim_updated', { claimId: claimId, fields: Object.keys(updates) });
    },

    updateClaimStatus: async function (claimId, status, note) {
        const old = await DbService.getClaim(claimId);
        const history = Array.isArray(old && old.statusHistory) ? old.statusHistory.slice() : [];
        history.push({ status: status, at: new Date().toISOString(), by: AuthService.getUid(), note: note || '' });
        await DbService.updateClaim(claimId, { status: status, statusNote: note || '', statusHistory: history });
        if (old && old.userId) { try { await DbService.addNotification(old.userId, { title: 'Claim status updated', body: 'Claim '+claimId+' is now '+String(status).replace(/_/g,' ')+'.'+(note?' '+note:''), type: 'status_change', link: 'decision.html?claimId='+encodeURIComponent(claimId), claimId: claimId }); } catch (e) {} }
    },

    deleteClaim: async function (claimId) {
        await fbDb.collection(COLLECTIONS.CLAIMS).doc(claimId).delete();
        DbService.logAudit('claim_deleted', { claimId: claimId });
    },

    /* ============================ DOCUMENTS =========================
       Metadata-only storage: filePath, fileName, fileType, fileSize, etc. */

    /** Register a document's metadata (file itself stays where it is). */
    addDocument: async function (meta) {
        const uid = AuthService.getUid();
        const ref = await fbDb.collection(COLLECTIONS.DOCUMENTS).add({
            userId:     uid,
            uploadedAt: FieldValue.serverTimestamp(),
            ...meta     // { claimId?, filePath, fileName, fileType, fileSize, ... }
        });
        DbService.logAudit('document_added', { docId: ref.id, fileName: meta.fileName });
        return ref.id;
    },

    getDocuments: async function (userId, claimId) {
        let q = fbDb.collection(COLLECTIONS.DOCUMENTS);
        const uid = AuthService.getUid();
        let role = 'user';
        try { const profile = await fbDb.collection(COLLECTIONS.USERS).doc(uid).get(); role = profile.exists ? String(profile.data().role || 'user') : 'user'; } catch(e) {}
        if (userId) q = q.where('userId', '==', userId);
        else if ((role === 'user' || role === 'employee')) q = q.where('userId', '==', uid);
        if (claimId) q = q.where('claimId', '==', claimId);
        const snap = await q.get();
        return snap.docs.map(function (d) { return { id: d.id, ...d.data() }; }).sort(function(a,b){
            const av=a.uploadedAt&&a.uploadedAt.toMillis?a.uploadedAt.toMillis():0;
            const bv=b.uploadedAt&&b.uploadedAt.toMillis?b.uploadedAt.toMillis():0;
            return bv-av;
        });
    },

    updateDocument: async function (docId, updates) {
        await fbDb.collection(COLLECTIONS.DOCUMENTS).doc(docId).update(updates);
    },

    deleteDocument: async function (docId) {
        await fbDb.collection(COLLECTIONS.DOCUMENTS).doc(docId).delete();
        DbService.logAudit('document_deleted', { docId: docId });
    },

    /* ============================ PRODUCTS ============================ */


    createProduct: async function (productData) {
        const uid = AuthService.getUid();
        const ref = await fbDb.collection(COLLECTIONS.PRODUCTS).add({
            userId: uid,
            user_id: uid,
            productId: "PROD-" + Date.now(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            ...productData,
            userId: uid,
            user_id: uid
        });
        DbService.logAudit('product_created', { productId: ref.id });
        return ref.id;
    },

    updateProduct: async function (productId, updates) {
        await fbDb.collection(COLLECTIONS.PRODUCTS).doc(productId).update({
            ...updates,
            updatedAt: FieldValue.serverTimestamp()
        });
        DbService.logAudit('product_updated', { productId: productId });
    },

    deleteProduct: async function (productId) {
        await fbDb.collection(COLLECTIONS.PRODUCTS).doc(productId).delete();
        DbService.logAudit('product_deleted', { productId: productId });
    },

    getProducts: async function () {
        const uid = AuthService.getUid();
        if (!uid) throw new Error('Authentication required.');
        let role = 'user';
        try {
            const profile = await fbDb.collection(COLLECTIONS.USERS).doc(uid).get();
            role = profile.exists ? String(profile.data().role || 'user') : 'user';
        } catch(e) {}
        let snap;
        if (role === 'admin' || role === 'reviewer') {
            snap = await fbDb.collection(COLLECTIONS.PRODUCTS).get();
        } else {
            // Firestore cannot OR two ownership fields in a single legacy-safe query.
            // Read both canonical and legacy records, then de-duplicate by document ID.
            const [a,b] = await Promise.all([
                fbDb.collection(COLLECTIONS.PRODUCTS).where('userId', '==', uid).get(),
                fbDb.collection(COLLECTIONS.PRODUCTS).where('user_id', '==', uid).get()
            ]);
            const docs = new Map();
            a.docs.concat(b.docs).forEach(function(d){ docs.set(d.id, d); });
            snap = { docs: Array.from(docs.values()) };
        }
        const rows = snap.docs.map(function (d) { return { id: d.id, ...d.data() }; });
        rows.sort(function(a,b){ return String(a.name||a.product_name||'').localeCompare(String(b.name||b.product_name||'')); });
        return rows;
    },

    getProduct: async function (productId) {
        const snap = await fbDb.collection(COLLECTIONS.PRODUCTS).doc(productId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    },

    /* ========================== MODEL_VERSIONS ========================
       Powers the AI/model comparison UI. */

    getModelVersions: async function () {
        const snap = await fbDb.collection(COLLECTIONS.MODEL_VERSIONS)
            .orderBy('version', 'desc').get();
        return snap.docs.map(function (d) { return { id: d.id, ...d.data() }; });
    },

    getActiveModel: async function () {
        const snap = await fbDb.collection(COLLECTIONS.MODEL_VERSIONS)
            .where('isActive', '==', true).limit(1).get();
        return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
    },

    /**
     * Compare two model versions for the AI comparison UI.
     * Returns { a, b, differences } where differences flags changed metrics.
     */
    compareModels: async function (versionA, versionB) {
        const [a, b] = await Promise.all([
            fbDb.collection(COLLECTIONS.MODEL_VERSIONS).doc(versionA).get(),
            fbDb.collection(COLLECTIONS.MODEL_VERSIONS).doc(versionB).get()
        ]);
        const dataA = a.exists ? { id: a.id, ...a.data() } : null;
        const dataB = b.exists ? { id: b.id, ...b.data() } : null;
        if (!dataA || !dataB) return null;

        const metrics = ['accuracy', 'precision', 'recall', 'f1Score'];
        const differences = {};
        metrics.forEach(function (m) {
            if (dataA[m] !== undefined && dataB[m] !== undefined) {
                differences[m] = {
                    a: dataA[m], b: dataB[m],
                    delta: (dataB[m] - dataA[m])
                };
            }
        });
        return { a: dataA, b: dataB, differences: differences };
    },


    resolveModelVersions: async function (claim) {
        const result = { python: null, teachableMachine: null };
        const snapshot = claim && claim.modelVersions;
        if (snapshot && snapshot.python) result.python = snapshot.python;
        if (snapshot && snapshot.teachableMachine) result.teachableMachine = snapshot.teachableMachine;
        if (result.python && result.teachableMachine) return result;
        try {
            const versions = await DbService.getModelVersions();
            result.python = result.python || versions.find(v => String(v.modelType || '').toLowerCase().includes('python')) || null;
            result.teachableMachine = result.teachableMachine || versions.find(v => String(v.modelType || '').toLowerCase().includes('teachable')) || null;
        } catch (e) { /* version collection may not be seeded yet */ }
        return result;
    },

    logError: function (error, context) {
        const uid = AuthService.getUid();
        if (!uid) return;
        const payload = {
            userId: uid,
            code: error && error.code || 'client_error',
            message: error && error.message || String(error || 'Unknown error'),
            context: context || {},
            page: location.pathname,
            timestamp: FieldValue.serverTimestamp()
        };
        fbDb.collection('error_events').add(payload).catch(function(e){ console.warn('[ErrorLog] failed:', e); });
    },

    recordAnomaly: async function (type, severity, details) {
        const uid = AuthService.getUid();
        if (!uid) return;
        await fbDb.collection('anomaly_alerts').add({
            userId: uid, type: type, severity: severity || 'medium', details: details || {},
            createdAt: FieldValue.serverTimestamp(), status: 'open'
        });
    },

    /* ========================== NOTIFICATIONS ========================= */

    addNotification: async function (userId, notification) {
        await fbDb.collection(COLLECTIONS.NOTIFICATIONS).add({
            userId:    userId,
            read:      false,
            createdAt: FieldValue.serverTimestamp(),
            ...notification           // { title, body, type?, link? }
        });
    },

    /** Mark a single notification read. */
    markNotificationRead: async function (notifId) {
        await fbDb.collection(COLLECTIONS.NOTIFICATIONS).doc(notifId)
            .update({ read: true, readAt: FieldValue.serverTimestamp() });
    },

    /** Mark ALL of the current user's notifications read. */
    markAllNotificationsRead: async function () {
        const uid = AuthService.getUid();
        if (!uid) return;
        const snap = await fbDb.collection(COLLECTIONS.NOTIFICATIONS)
            .where('userId', '==', uid).where('read', '==', false).get();
        const batch = fbDb.batch();
        snap.docs.forEach(function (d) { batch.update(d.ref, { read: true }); });
        await batch.commit();
    },

    listenNotifications: function (userId, callback, onError) {
        return fbDb.collection(COLLECTIONS.NOTIFICATIONS)
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .onSnapshot(function (snap) {
                callback(snap.docs.map(function (d) { return { id: d.id, ...d.data() }; }));
            }, onError || function (err) { console.error("[AssureX] Notification listener:", err); });
    },

    /* ============================ AUDIT_LOGS ========================== */

    /** Write an audit_logs entry (fire-and-forget). */
    logAudit: function (action, details) {
        const uid = AuthService.getUid();
        fbDb.collection(COLLECTIONS.AUDIT_LOGS).add({
            userId:    uid,
            action:    action,
            details:   details || {},
            timestamp: FieldValue.serverTimestamp()
        }).catch(function (e) { console.warn('[Audit] failed:', e); });
    },

    getAuditLogs: async function (limitCount) {
        let q = fbDb.collection(COLLECTIONS.AUDIT_LOGS).orderBy('timestamp', 'desc');
        if (limitCount) q = q.limit(limitCount);
        const snap = await q.get();
        return snap.docs.map(function (d) { return { id: d.id, ...d.data() }; });
    },

    /* ========================== SECURITY_EVENTS ======================= */

    logSecurityEvent: function (type, data) {
        fbDb.collection(COLLECTIONS.SECURITY_EVENTS).add({
            type:      type,
            uid:       AuthService.getUid(),
            userAgent: navigator.userAgent,
            data:      data || {},
            timestamp: FieldValue.serverTimestamp()
        }).catch(function (e) { console.warn('[Security] failed:', e); });
    },

    getSetting: async function (key, fallback) {
        try { const s = await fbDb.collection('system_settings').doc(key).get(); return s.exists ? s.data() : (fallback || null); } catch (e) { return fallback || null; }
    },

    setSetting: async function (key, data) {
        await fbDb.collection('system_settings').doc(key).set({ ...data, updatedAt: FieldValue.serverTimestamp(), updatedBy: AuthService.getUid() }, { merge: true });
        DbService.logAudit('system_setting_updated', { key: key });
    },

    getSecurityEvents: async function (limitCount) {
        let q = fbDb.collection(COLLECTIONS.SECURITY_EVENTS).orderBy('timestamp', 'desc');
        if (limitCount) q = q.limit(limitCount);
        const snap = await q.get();
        return snap.docs.map(function (d) { return { id: d.id, ...d.data() }; });
    }
};
