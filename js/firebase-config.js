/**
 * firebase-config.js
 * AssureX Firebase initialization
 * Firebase v10 Compat SDK
 *
 * Required SDKs before this file:
 * - firebase-app-compat.js
 * - firebase-auth-compat.js
 * - firebase-firestore-compat.js
 */

// ============================================
// FIREBASE CONFIGURATION
// ============================================

window.firebaseConfig = {
    apiKey: "AIzaSyCdEdl6gy21ePTORZ9nRqV8cR293qyqKK8",
    authDomain: "assurexclaim.firebaseapp.com",
    projectId: "assurexclaim",
    messagingSenderId: "360751508371",
    appId: "1:360751508371:web:cbe00c303bf0e74875d666",
    measurementId: "G-S0TQKGBH3P"
};


// ============================================
// INITIALIZE FIREBASE
// ============================================

try {

    if (!window.firebase) {
        throw new Error(
            "Firebase SDK was not loaded before firebase-config.js."
        );
    }

    // Prevent duplicate initialization
    if (!firebase.apps.length) {
        firebase.initializeApp(window.firebaseConfig);
    }

    console.log(
        "[Firebase] Initialized for project:",
        window.firebaseConfig.projectId
    );


    // ========================================
    // AUTH
    // ========================================

    window.fbAuth = firebase.auth();


    // ========================================
    // FIRESTORE
    // ========================================

    window.fbDb = firebase.firestore();


    // ========================================
    // FIREBASE READY STATE
    // ========================================

    window.firebaseReady = true;


    console.log("[Firebase] Authentication initialized.");
    console.log("[Firebase] Firestore initialized.");
    console.log("[Firebase] Firebase ready.");


} catch (error) {

    window.firebaseReady = false;

    window.fbAuth = null;
    window.fbDb = null;

    console.error(
        "[Firebase] Initialization failed:",
        error
    );
}


// ============================================
// FIRESTORE FIELD HELPERS
// ============================================

window.FieldValue = (window.firebase && firebase.firestore) ? firebase.firestore.FieldValue : null;
window.Timestamp = (window.firebase && firebase.firestore) ? firebase.firestore.Timestamp : null;


// ============================================
// COLLECTION NAMES
// ============================================

window.COLLECTIONS = {
    USERS: "users",
    PRODUCTS: "products",
    CLAIMS: "claims",
    DOCUMENTS: "documents",
    REPAIR_RECORDS: "repair_records",
    MODEL_VERSIONS: "model_versions",
    NOTIFICATIONS: "notifications",
    AUDIT_LOGS: "audit_logs",
    SECURITY_EVENTS: "security_events"
};


// ============================================
// FIREBASE USER HELPER
// ============================================

window.getFirebaseUser = function () {

    if (!window.fbAuth) {
        return null;
    }

    return window.fbAuth.currentUser || null;
};


// ============================================
// DATABASE SERVICE
// ============================================

window.DbService = window.DbService || {};


// ============================================
// CREATE PRODUCT
// ============================================

window.DbService.createProduct = async function (productData) {

    if (!window.firebaseReady) {
        throw new Error(
            "Firebase is not initialized."
        );
    }

    const user = window.getFirebaseUser();

    if (!user) {
        throw new Error(
            "Firebase user not authenticated."
        );
    }

    const productRef = await window.fbDb
        .collection("products")
        .add({

            ...productData,

            user_id: user.uid,

            created_at:
                firebase.firestore.FieldValue.serverTimestamp(),

            updated_at:
                firebase.firestore.FieldValue.serverTimestamp()

        });


    await window.DbService.saveAuditLog({

        action: "CREATE_PRODUCT",

        productId: productRef.id,

        userId: user.uid

    });


    return productRef.id;
};


// ============================================
// READ PRODUCTS
// ============================================

window.DbService.getProducts = async function () {

    if (!window.firebaseReady) {
        throw new Error(
            "Firebase is not initialized."
        );
    }

    const user = window.getFirebaseUser();

    if (!user) {
        throw new Error(
            "Firebase user not authenticated."
        );
    }

    let query = window.fbDb.collection("products");
    try {
        const profile = await window.fbDb.collection("users").doc(user.uid).get();
        const role = profile.exists ? String(profile.data().role || "user") : "user";
        if (role === "user") query = query.where("user_id", "==", user.uid);
    } catch (e) {
        query = query.where("user_id", "==", user.uid);
    }
    const snapshot = await query.get();


    return snapshot.docs.map(function (doc) {

        return {
            id: doc.id,
            ...doc.data()
        };

    });
};


// ============================================
// UPDATE PRODUCT
// ============================================

window.DbService.updateProduct = async function (
    productId,
    data
) {

    if (!window.firebaseReady) {
        throw new Error(
            "Firebase is not initialized."
        );
    }

    const user = window.getFirebaseUser();

    if (!user) {
        throw new Error(
            "Firebase user not authenticated."
        );
    }


    await window.fbDb
        .collection("products")
        .doc(productId)
        .update({

            ...data,

            user_id: user.uid,

            updated_at:
                firebase.firestore.FieldValue.serverTimestamp()

        });


    await window.DbService.saveAuditLog({

        action: "UPDATE_PRODUCT",

        productId: productId,

        userId: user.uid

    });
};


// ============================================
// DELETE PRODUCT
// ============================================

window.DbService.deleteProduct = async function (
    productId
) {

    if (!window.firebaseReady) {
        throw new Error(
            "Firebase is not initialized."
        );
    }

    const user = window.getFirebaseUser();

    if (!user) {
        throw new Error(
            "Firebase user not authenticated."
        );
    }


    await window.fbDb
        .collection("products")
        .doc(productId)
        .delete();


    await window.DbService.saveAuditLog({

        action: "DELETE_PRODUCT",

        productId: productId,

        userId: user.uid

    });
};


// ============================================
// SAVE AUDIT LOG
// ============================================

window.DbService.saveAuditLog = async function (data) {

    if (!window.firebaseReady) {
        throw new Error(
            "Firebase is not initialized."
        );
    }

    await window.fbDb
        .collection("audit_logs")
        .add({

            ...data,

            created_at:
                firebase.firestore.FieldValue.serverTimestamp()

        });
};


// ============================================
// FINAL DEBUG
// ============================================

console.log(
    "[AssureX] Firebase configuration loaded."
);

console.log(
    "[AssureX] Firestore available:",
    !!window.fbDb
);

console.log(
    "[AssureX] Auth available:",
    !!window.fbAuth
);