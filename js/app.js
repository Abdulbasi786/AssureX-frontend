/* =========================================================
   ASSUREX
   UNIFIED APPLICATION
   Landing + Authentication + Dashboard
========================================================= */


/* =========================================================
   FIREBASE CONFIGURATION
   Replace these values with your Firebase project config.
========================================================= */

/**
 * firebase-config.js
 * Firebase initialization — Firebase v9 compat SDK (works with plain <script> tags).
 * Fill in your project credentials from:
 * Firebase Console → Project settings → "Your apps" → Web app
 */

// const firebaseConfig = {
//     apiKey: "AIzaSyCdEdl6gy21ePTORZ9nRqV8cR293qyqKK8",
//     authDomain: "assurexclaim.firebaseapp.com",
//     projectId: "assurexclaim",
//     storageBucket: "assurexclaim.firebasestorage.app",
//     messagingSenderId: "360751508371",
//     appId: "1:360751508371:web:cbe00c303bf0e74875d666",
//     measurementId: "G-S0TQKGBH3P"
// };
// Initialize Firebase (guard against double-init when scripts are reloaded)
// if (!firebase.apps.length) {
//     firebase.initializeApp(firebaseConfig);
// }

// Shared handles used by all other firebase-*.js files
// const fbAuth = firebase.auth();
// const fbDb = firebase.firestore();

// Firestore settings — keep local writes snappy, survive temporary offline


// Convenience constants
// const FieldValue = firebase.firestore.FieldValue;
// const Timestamp = firebase.firestore.Timestamp;
// const COLLECTIONS = {
//     USERS: 'users',
//     PRODUCTS: 'products',
//     CLAIMS: 'claims',
//     DOCUMENTS: 'documents',
//     MODEL_VERSIONS: 'model_versions',
//     NOTIFICATIONS: 'notifications',
//     AUDIT_LOGS: 'audit_logs',
//     SECURITY_EVENTS: 'security_events'
// };

// console.log('[Firebase] Initialized for project:', firebaseConfig.projectId);


/* =========================================================
   FIREBASE INITIALIZATION
========================================================= */

let firebaseReady = !!window.firebaseReady;
let auth = window.fbAuth || null;
let db = window.fbDb || null;

// Firebase is initialized once by js/firebase-config.js. This module only
// aliases those shared handles; it must never initialize a second app.
if (!firebaseReady && window.firebase && window.fbAuth && window.fbDb) {
    firebaseReady = true;
    auth = window.fbAuth;
    db = window.fbDb;
}



/* =========================================================
   HELPERS
========================================================= */

const $ = selector =>
    document.querySelector(selector);

const $$ = selector =>
    [...document.querySelectorAll(selector)];


const state = {

    page: "dashboard",

    theme:
        localStorage.getItem("assurexTheme") ||
        "dark",

    compact:
        localStorage.getItem("assurexCompact") === "1",

    claimStep: 1

};


const fbUser = {
    user: null,
    doc: null
};


const pages = [
    "dashboard",
    "products",
    "warranties",
    "documents",
    "claims",
    "validation",
    "evaluation",
    "decision",
    "analytics",
    "readiness",
    "profile"
];


const commands = [

    ["Dashboard", "Overview", "dashboard"],
    ["Products", "Product registry", "products"],
    ["Warranties", "Warranty policies", "warranties"],
    ["Documents", "Evidence center", "documents"],
    ["Claims", "Claim wizard", "claims"],
    ["Validation", "Rules and data quality", "validation"],
    ["AI Evaluation", "Python + Teachable Machine", "evaluation"],
    ["Decision & Review", "Final decision and reviewer action", "decision"],
    ["Admin & Analytics", "Operational dashboard", "analytics"],
    ["Readiness", "Release checklist", "readiness"],
    ["Profile", "Account settings", "profile"]

];


/* =========================================================
   TOAST
========================================================= */

function toast(message) {

    const element = $("#toast");

    if (!element) return;

    element.textContent = message;

    element.style.opacity = "1";
    element.style.transform =
        "translate(-50%, 0)";

    clearTimeout(window.__toast);

    window.__toast = setTimeout(() => {

        element.style.opacity = "0";

        element.style.transform =
            "translate(-50%, 10px)";

    }, 2400);

}


/* =========================================================
   LANDING NAVIGATION
========================================================= */

function initLandingNavigation() {

    const menuButton =
        $("#mobileMenuButton");

    const mobileNavigation =
        $("#mobileNavigation");

    if (menuButton && mobileNavigation) {

        menuButton.addEventListener(
            "click",
            () => {

                mobileNavigation.classList.toggle(
                    "open"
                );

            }
        );

    }


    $$("#mobileNavigation a").forEach(
        link => {

            link.addEventListener(
                "click",
                () => {

                    mobileNavigation?.classList.remove(
                        "open"
                    );

                }
            );

        }
    );


    document
        .querySelectorAll('a[href^="#"]')
        .forEach(link => {

            link.addEventListener(
                "click",
                event => {

                    const targetId =
                        link.getAttribute("href");

                    if (
                        !targetId ||
                        targetId === "#"
                    ) return;

                    const target =
                        document.querySelector(targetId);

                    if (!target) return;

                    event.preventDefault();

                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });

                }
            );

        });


    const sections =
        [...document.querySelectorAll(
            "main section[id]"
        )];

    const navLinks =
        [...document.querySelectorAll(
            ".landing-nav a"
        )];


    if ("IntersectionObserver" in window) {

        const observer =
            new IntersectionObserver(
                entries => {

                    entries.forEach(entry => {

                        if (!entry.isIntersecting) {
                            return;
                        }

                        navLinks.forEach(
                            link =>
                                link.classList.remove(
                                    "active"
                                )
                        );

                        const active =
                            navLinks.find(
                                link =>
                                    link.getAttribute("href") ===
                                    `#${entry.target.id}`
                            );

                        active?.classList.add("active");

                    });

                },
                {
                    rootMargin:
                        "-35% 0px -55% 0px"
                }
            );

        sections.forEach(
            section =>
                observer.observe(section)
        );

    }

}


/* =========================================================
   REVEAL ANIMATIONS
========================================================= */

function initRevealAnimations() {

    const items =
        document.querySelectorAll(".reveal");

    if (
        !("IntersectionObserver" in window)
    ) {

        items.forEach(
            item =>
                item.classList.add("visible")
        );

        return;

    }

    const observer =
        new IntersectionObserver(
            entries => {

                entries.forEach(entry => {

                    if (!entry.isIntersecting) {
                        return;
                    }

                    entry.target.classList.add(
                        "visible"
                    );

                    observer.unobserve(
                        entry.target
                    );

                });

            },
            {
                threshold: .12
            }
        );


    items.forEach(
        item =>
            observer.observe(item)
    );

}


/* =========================================================
   AUTH VIEW
========================================================= */

function showAuth(mode = "login") {

    // On separated auth pages, route directly to the requested page.
    if (
        (mode === "login" && !$("#loginForm")) ||
        (mode === "register" && !$("#registerForm"))
    ) {
        window.location.href =
            mode === "register"
                ? "register.html"
                : "login.html";
        return;
    }

    $("#landingView")
        ?.classList.add("hidden");

    $("#authView")
        ?.classList.remove("hidden");

    $("#appView")
        ?.classList.add("hidden");


    $$(".auth-tab").forEach(
        button => {

            button.classList.toggle(
                "active",
                button.dataset.auth === mode
            );

        }
    );


    $("#loginForm")
        ?.classList.toggle(
            "hidden",
            mode !== "login"
        );


    $("#registerForm")
        ?.classList.toggle(
            "hidden",
            mode !== "register"
        );

}


function showLanding() {

    // When the landing page is a separate document, navigate back to it.
    function showLanding() {
        const landingView = $("#landingView");

        // If this is not the landing page, do nothing.
        // Never redirect login.html to index.html.
        if (!landingView) {
            return;
        }

        landingView.classList.remove("hidden");

        const appView = $("#appView");
        if (appView) {
            appView.classList.add("hidden");
        }

        document.body.classList.remove("app-mode");
        document.body.classList.add("landing-mode");
    }

    $("#landingView")
        ?.classList.remove("hidden");

    $("#authView")
        ?.classList.add("hidden");

    $("#appView")
        ?.classList.add("hidden");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


/* =========================================================
   AUTH BUTTONS
========================================================= */

function bindAuthNavigation() {

    $$("[data-open-auth]").forEach(
        button => {

            button.addEventListener(
                "click",
                event => {

                    event.preventDefault();

                    showAuth(
                        button.dataset.openAuth
                    );

                }
            );

        }
    );


    $("#backToLanding")
        ?.addEventListener(
            "click",
            showLanding
        );


    $$(".auth-tab").forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    showAuth(
                        button.dataset.auth
                    );

                }
            );

        }
    );


    $("#showPassword")
        ?.addEventListener(
            "click",
            () => {

                const input =
                    $("#loginPassword");

                if (!input) return;

                const visible =
                    input.type === "text";

                input.type =
                    visible
                        ? "password"
                        : "text";

                $("#showPassword").textContent =
                    visible
                        ? "Show"
                        : "Hide";

            }
        );


    $("#loginForm")
        ?.addEventListener(
            "submit",
            handleLogin
        );


    $("#registerForm")
        ?.addEventListener(
            "submit",
            handleRegister
        );

}


/* =========================================================
   FIREBASE AUTH SERVICE
========================================================= */

const AuthService = {

    async signIn(email, password) {

        if (!firebaseReady) {

            throw new Error(
                "Firebase is not configured."
            );

        }

        return auth.signInWithEmailAndPassword(
            email,
            password
        );

    },


    async signUp(
        email,
        password,
        displayName,
        role = "reviewer"
    ) {

        if (!firebaseReady) {

            throw new Error(
                "Firebase is not configured."
            );

        }

        const credential =
            await auth.createUserWithEmailAndPassword(
                email,
                password
            );

        await credential.user.updateProfile({
            displayName
        });


        await db
            .collection("users")
            .doc(credential.user.uid)
            .set(
                {
                    displayName,
                    email,
                    role,
                    createdAt:
                        firebase.firestore.FieldValue
                            .serverTimestamp()
                },
                {
                    merge: true
                }
            );


        return credential;

    },


    async signOut() {

        if (!firebaseReady) {
            return;
        }

        return auth.signOut();

    },


    onAuthChanged(callback) {

        if (!firebaseReady) {

            callback(null, null);

            return;

        }


        return auth.onAuthStateChanged(
            async user => {

                if (!user) {

                    callback(null, null);

                    return;

                }

                let userDoc = null;

                try {

                    const snapshot =
                        await db
                            .collection("users")
                            .doc(user.uid)
                            .get();

                    userDoc =
                        snapshot.exists
                            ? snapshot.data()
                            : null;

                } catch (error) {

                    console.warn(
                        "Unable to read user profile:",
                        error
                    );

                }

                callback(user, userDoc);

            }
        );

    }

};


/* =========================================================
   AUTH HANDLERS
========================================================= */

async function handleLogin(event) {

    event.preventDefault();

    const email =
        $("#loginEmail")
            .value
            .trim();

    const password =
        $("#loginPassword")
            .value;

    const status =
        $("#loginStatus");


    status.textContent =
        "Signing in…";


    try {

        await AuthService.signIn(
            email,
            password
        );

        status.textContent =
            "Signed in successfully.";

        toast("Welcome back");

    } catch (error) {

        status.textContent =
            authErrorMessage(error);

    }

}


async function handleRegister(event) {

    event.preventDefault();

    const name =
        $("#regName")
            .value
            .trim();

    const email =
        $("#regEmail")
            .value
            .trim();

    const password =
        $("#regPassword")
            .value;

    const role =
        $("#regRole")
            ?.value ||
        "reviewer";

    const status =
        $("#registerStatus");


    status.textContent =
        "Creating account…";


    try {

        await AuthService.signUp(
            email,
            password,
            name,
            role
        );

        status.textContent =
            "Account created. Connecting to workspace…";

        toast("Account created");

    } catch (error) {

        status.textContent =
            authErrorMessage(error);

    }

}


function authErrorMessage(error) {

    const code =
        error?.code || "";


    const map = {

        "auth/invalid-email":
            "Invalid email address.",

        "auth/user-disabled":
            "This account has been disabled.",

        "auth/user-not-found":
            "No account found with this email.",

        "auth/wrong-password":
            "Incorrect password.",

        "auth/invalid-credential":
            "Incorrect email or password.",

        "auth/email-already-in-use":
            "This email is already registered.",

        "auth/weak-password":
            "Password must be at least 6 characters.",

        "auth/network-request-failed":
            "Network error — check your connection.",

        "auth/too-many-requests":
            "Too many attempts — try again later."

    };


    return (
        map[code] ||
        error?.message ||
        "Authentication failed."
    );

}


/* =========================================================
   APPLICATION VIEW
========================================================= */

function showApp() {

    if (!fbUser.user) {
        return;
    }


    const name =
        fbUser.doc?.displayName ||
        fbUser.user.displayName ||
        fbUser.user.email ||
        "User";


    const role =
        fbUser.doc?.role ||
        "reviewer";


    // Each dashboard section is now its own HTML document.
    if (!$("#appView")) {
        const requested =
            location.pathname
                .split("/")
                .pop()
                .replace(".html", "") || "dashboard";

        window.location.href =
            (pages.includes(requested) ? requested : "dashboard") +
            ".html";
        return;
    }

    $("#landingView")
        ?.classList.add("hidden");

    $("#authView")
        ?.classList.add("hidden");

    $("#appView")
        ?.classList.remove("hidden");


    if ($("#profileName")) {
        $("#profileName").textContent = name;
    }

    if ($("#profileRole")) {
        $("#profileRole").textContent =
            role.charAt(0).toUpperCase() +
            role.slice(1);
    }


    if ($("#profileNameInput")) {
        $("#profileNameInput").value = name;
    }


    if ($("#profileAvatarLarge")) {
        $("#profileAvatarLarge").textContent = initials(name);
    }


    if ($("#userAvatar")) {
        $("#userAvatar").textContent = initials(name);
    }


    loadProducts();

    // Each workspace section is now a separate HTML document.
    // Preserve the current document instead of defaulting every page to dashboard.
    const documentPage =
        document.querySelector(".page")?.dataset.page;

    const requestedPage =
        location.hash.slice(1) ||
        documentPage ||
        "dashboard";

    showPage(
        pages.includes(requestedPage)
            ? requestedPage
            : "dashboard"
    );

}


function initials(name) {

    return String(name)
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

}


/* =========================================================
   DASHBOARD NAVIGATION
========================================================= */

function showPage(page) {

    if (!pages.includes(page)) {
        page = "dashboard";
    }


    state.page = page;

    // In the separated frontend, one dashboard page is loaded at a time.
    const currentPage = document.querySelector(".page")?.dataset.page;
    const pageElements = $$(".page");

    if (
        pageElements.length === 1 &&
        currentPage &&
        currentPage !== page
    ) {
        window.location.href = page + ".html";
        return;
    }


    pageElements.forEach(
        section => {

            section.classList.toggle(
                "hidden",
                section.dataset.page !== page
            );

        }
    );


    $$(".nav-item").forEach(
        button => {

            button.classList.toggle(
                "active",
                button.dataset.page === page
            );

        }
    );


    $("#sidebar")
        ?.classList.remove("open");


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });


    if (
        location.hash !== "#" + page
    ) {

        history.replaceState(
            null,
            "",
            "#" + page
        );

    }

}


function bindNavigation() {

    $$(".nav-item").forEach(
        button => {

            button.addEventListener(
                "click",
                () =>
                    showPage(
                        button.dataset.page
                    )
            );

        }
    );


    $$("[data-go]").forEach(
        button => {

            button.addEventListener(
                "click",
                () =>
                    showPage(
                        button.dataset.go
                    )
            );

        }
    );


    $("#sidebarToggle")
        ?.addEventListener(
            "click",
            () =>
                $("#sidebar")
                    ?.classList.toggle("open")
        );


    $("#closeSidebar")
        ?.addEventListener(
            "click",
            () =>
                $("#sidebar")
                    ?.classList.remove("open")
        );


    $("#logout")
        ?.addEventListener(
            "click",
            async () => {

                try {

                    await AuthService.signOut();

                } catch (error) {

                    console.error(error);

                }

                window.location.href = "login.html";

            }
        );

}


/* =========================================================
   THEME
========================================================= */

function applyTheme(
    theme,
    save = true
) {

    state.theme = theme;


    document.body.classList.remove(
        "theme-light",
        "theme-dark"
    );

    document.body.classList.add(
        "theme-" + theme
    );


    if (save) {

        localStorage.setItem(
            "assurexTheme",
            theme
        );

    }


    const names = {

        light:
            "Light Mode",

        dark:
            "Dark Mode"

    };


    if ($("#currentTheme")) {

        $("#currentTheme").textContent =
            names[theme] ||
            names.blue;

    }

}


function bindTheme() {

    applyTheme(
        state.theme,
        false
    );


    $("#themeButton")
        ?.addEventListener(
            "click",
            () =>
                $("#themeMenu")
                    ?.classList.toggle("hidden")
        );


    $("#closeTheme")
        ?.addEventListener(
            "click",
            () =>
                $("#themeMenu")
                    ?.classList.add("hidden")
        );


    $$(".theme-choice").forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    applyTheme(
                        button.dataset.theme
                    );

                    $("#themeMenu")
                        ?.classList.add("hidden");

                    toast("Theme updated");

                }
            );

        }
    );


    $("#densityButton")
        ?.addEventListener(
            "click",
            () => {

                state.compact =
                    !state.compact;


                document.body.classList.toggle(
                    "compact",
                    state.compact
                );


                localStorage.setItem(
                    "assurexCompact",
                    state.compact
                        ? "1"
                        : "0"
                );


                toast(
                    state.compact
                        ? "Compact density enabled"
                        : "Comfortable density enabled"
                );

            }
        );


    document.body.classList.toggle(
        "compact",
        state.compact
    );

}


/* =========================================================
   COMMAND PALETTE
========================================================= */

function bindCommand() {

    const open = () => {

        $("#commandPalette")
            ?.classList.remove("hidden");

        $("#commandInput").value = "";

        renderCommands("");

        setTimeout(
            () =>
                $("#commandInput")
                    ?.focus(),
            30
        );

    };


    const close = () => {

        $("#commandPalette")
            ?.classList.add("hidden");

    };


    $("#commandButton")
        ?.addEventListener(
            "click",
            open
        );


    $("#commandPalette")
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target.id ===
                    "commandPalette"
                ) {

                    close();

                }

            }
        );


    $("#closeCommand")
        ?.addEventListener(
            "click",
            close
        );


    $("#commandInput")
        ?.addEventListener(
            "input",
            event =>
                renderCommands(
                    event.target.value
                )
        );


    window.addEventListener(
        "keydown",
        event => {

            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "k"
            ) {

                event.preventDefault();

                open();

            }


            if (event.key === "Escape") {

                close();

                $("#themeMenu")
                    ?.classList.add("hidden");

            }

        }
    );

}


function renderCommands(query) {

    const q =
        query
            .toLowerCase()
            .trim();


    const list =
        commands.filter(
            item =>
                (
                    item[0] +
                    " " +
                    item[1]
                )
                    .toLowerCase()
                    .includes(q)
        );


    const container =
        $("#commandResults");


    if (!container) return;


    container.innerHTML =
        list.length

            ? list.map(
                item => `

            <div
              class="command-item"
              data-command-page="${item[2]}"
            >

              <span>
                <b>${item[0]}</b>
                <small>${item[1]}</small>
              </span>

              <small>Open ↵</small>

            </div>

          `
            ).join("")

            : `
        <div class="command-item">
          <b>No results</b>
        </div>
      `;


    $$("[data-command-page]")
        .forEach(
            item => {

                item.addEventListener(
                    "click",
                    () => {

                        showPage(
                            item.dataset.commandPage
                        );

                        $("#commandPalette")
                            ?.classList.add("hidden");

                    }
                );

            }
        );

}


/* =========================================================
   CLAIM WIZARD
========================================================= */

const claimDraft = {};


function readWizardInputs() {

    const step =
        state.claimStep;

    const values = {};


    $$(
        `.wizard-step[data-wstep="${step}"]
     input,
     .wizard-step[data-wstep="${step}"]
     select,
     .wizard-step[data-wstep="${step}"]
     textarea`
    )
        .forEach(element => {

            const key =
                element.name ||
                element.id;


            if (!key) return;


            if (
                element.type === "checkbox"
            ) {

                values[key] =
                    element.checked;

            } else {

                values[key] =
                    element.value;

            }

        });


    return values;

}


function setClaimStep(step) {

    state.claimStep = step;


    $$(".step").forEach(
        button => {

            button.classList.toggle(
                "active",
                Number(button.dataset.step) ===
                step
            );

        }
    );


    $$(".wizard-step").forEach(
        section => {

            section.classList.toggle(
                "active",
                Number(section.dataset.wstep) ===
                step
            );

        }
    );


    $("#claimStepLabel").textContent =
        `Step ${step} of 7`;


    $("#prevStep").disabled =
        step === 1;


    $("#nextStep").textContent =
        step === 7
            ? "Submit Claim"
            : "Continue →";

}


function bindWizard() {

    $$(".step").forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const current =
                        readWizardInputs();

                    Object.assign(
                        claimDraft,
                        current
                    );


                    setClaimStep(
                        Number(button.dataset.step)
                    );

                }
            );

        }
    );


    $("#prevStep")
        ?.addEventListener(
            "click",
            () =>
                setClaimStep(
                    Math.max(
                        1,
                        state.claimStep - 1
                    )
                )
        );


    $("#nextStep")
        ?.addEventListener(
            "click",
            async () => {

                Object.assign(
                    claimDraft,
                    readWizardInputs()
                );


                if (
                    state.claimStep < 7
                ) {

                    setClaimStep(
                        state.claimStep + 1
                    );

                } else {

                    await submitClaim();

                }

            }
        );

}


/* =========================================================
   FIRESTORE SERVICE
========================================================= */

// const DbService = {

//     async createClaim(data) {

//         if (!firebaseReady) {

//             const localId =
//                 "LOCAL-" +
//                 Date.now();

//             return localId;

//         }


//         const userId =
//             fbUser.user?.uid ||
//             null;


//         const payload = {

//             ...data,

//             userId,

//             createdAt:
//                 firebase.firestore.FieldValue
//                     .serverTimestamp(),

//             updatedAt:
//                 firebase.firestore.FieldValue
//                     .serverTimestamp()

//         };


//         const ref =
//             await db
//                 .collection("claims")
//                 .add(payload);


//         return ref.id;

//     },


//     async getProducts() {

//         if (!firebaseReady) {
//             return [];
//         }


//         const snapshot =
//             await db
//                 .collection("products")
//                 .limit(100)
//                 .get();


//         return snapshot.docs.map(
//             doc => ({
//                 id: doc.id,
//                 ...doc.data()
//             })
//         );

//     },


//     async addDocument(meta) {

//         if (!firebaseReady) {
//             return;
//         }


//         return db
//             .collection("documents")
//             .add({

//                 ...meta,

//                 userId:
//                     fbUser.user?.uid ||
//                     null,

//                 createdAt:
//                     firebase.firestore.FieldValue
//                         .serverTimestamp()

//             });

//     },


//     async updateClaimStatus(
//         claimId,
//         status,
//         comments
//     ) {

//         if (!firebaseReady) {
//             return;
//         }


//         return db
//             .collection("claims")
//             .doc(claimId)
//             .update({

//                 status,

//                 reviewerComments:
//                     comments,

//                 reviewedBy:
//                     fbUser.user?.uid ||
//                     null,

//                 reviewedAt:
//                     firebase.firestore.FieldValue
//                         .serverTimestamp()

//             });

//     },


//     async compareModels(
//         python,
//         teachableMachine
//     ) {

//         const pythonConfidence = 87;
//         const tmConfidence = 82;

//         return {

//             python,
//             teachableMachine,

//             differences: {

//                 classAgreement: true,

//                 confidenceDifference:
//                     Math.abs(
//                         pythonConfidence -
//                         tmConfidence
//                     )

//             }

//         };

//     }

// };


/* =========================================================
   CLAIM SUBMISSION
========================================================= */

async function submitClaim() {

    const button =
        $("#nextStep");


    button.disabled = true;

    button.textContent =
        "Submitting…";


    try {

        const claimId =
            await DbService.createClaim({

                wizardData:
                    { ...claimDraft },

                status:
                    "pending",

                source:
                    "claim_wizard",

                submittedAt:
                    new Date().toISOString()

            });


        toast(
            "Claim " +
            claimId.slice(0, 8) +
            " submitted"
        );


        Object.keys(
            claimDraft
        ).forEach(
            key =>
                delete claimDraft[key]
        );


        setClaimStep(1);

        showPage("validation");

    } catch (error) {

        console.error(
            "Claim submission failed:",
            error
        );

        toast(
            "Submit failed — check console"
        );

    } finally {

        button.disabled = false;

        button.textContent =
            "Submit Claim";

    }

}


/* =========================================================
   PRODUCTS
========================================================= */

const DEMO_PRODUCTS = [

    [
        "Samsung RF28",
        "SN-RF28-8821",
        "2024-04-12",
        "24 months",
        "Active",
        "good"
    ],

    [
        "LG WM-450",
        "SN-WM450-1190",
        "2023-11-02",
        "24 months",
        "Expiring",
        "warn"
    ],

    [
        "Haier AC-22",
        "SN-AC22-7712",
        "2025-01-20",
        "12 months",
        "Active",
        "good"
    ]

];


async function loadProducts() {

    try {

        const products =
            await DbService.getProducts();


        if (!products.length) {

            renderProductRows(
                DEMO_PRODUCTS
            );

            return;

        }


        renderProductRows(

            products.map(
                product => [

                    product.name ||
                    "—",

                    product.serialNumber ||
                    "—",

                    product.purchaseDate ||
                    "—",

                    product.warrantyMonths
                        ? product.warrantyMonths +
                        " months"
                        : "—",

                    product.status ||
                    "Active",

                    product.status ===
                        "Expiring"
                        ? "warn"
                        : "good"

                ]
            )

        );

    } catch (error) {

        console.warn(
            "Products unavailable:",
            error
        );

        renderProductRows(
            DEMO_PRODUCTS
        );

    }

}


function renderProductRows(rows) {

    const table =
        document.querySelector(
            ".table[data-page='products']"
        );


    if (!table) return;


    table.innerHTML = `

    <div class="tr th">
      <span>Product</span>
      <span>Serial Number</span>
      <span>Purchase Date</span>
      <span>Warranty</span>
      <span>Status</span>
    </div>

    ${rows.map(
        row => `

          <div class="tr">

            <b>${escapeHtml(row[0])}</b>

            <span>
              ${escapeHtml(row[1])}
            </span>

            <span>
              ${escapeHtml(row[2])}
            </span>

            <span>
              ${escapeHtml(row[3])}
            </span>

            <em class="pill ${row[5]}">
              ${escapeHtml(row[4])}
            </em>

          </div>

        `
    ).join("")
        }

  `;

}


/* =========================================================
   DASHBOARD INTERACTIONS
========================================================= */

function bindInteractions() {

    $("#runValidation")
        ?.addEventListener(
            "click",
            () => {

                toast(
                    "Validation completed"
                );

                $("#readyScore").textContent =
                    "88%";

            }
        );


    $("#runModels")
        ?.addEventListener(
            "click",
            async () => {

                toast(
                    "Running model comparison…"
                );


                try {

                    const comparison =
                        await DbService.compareModels(
                            "python",
                            "teachable_machine"
                        );


                    console.log(
                        "Model comparison:",
                        comparison.differences
                    );


                    toast(
                        "Models compared"
                    );

                } catch (error) {

                    console.error(error);

                    toast(
                        "Model comparison refreshed"
                    );

                }

            }
        );


    $("#saveReview")
        ?.addEventListener(
            "click",
            async () => {

                const comments =
                    $("#reviewComments")
                        .value
                        .trim();


                if (!comments) {

                    toast(
                        "Reviewer comments are required"
                    );

                    return;

                }


                const decision =
                    $("#reviewDecision")
                        .value;


                const normalized =
                    decision
                        .toLowerCase()
                        .replace(/\s+/g, "_");


                try {

                    await DbService
                        .updateClaimStatus(
                            "CLM-2026-00021",
                            normalized,
                            comments
                        );

                    $("#reviewSaved").textContent =
                        `Saved: ${decision}`;

                    toast(
                        "Reviewer action saved"
                    );

                } catch (error) {

                    console.error(error);

                    $("#reviewSaved").textContent =
                        `Saved: ${decision}`;

                    toast(
                        "Reviewer action saved locally"
                    );

                }

            }
        );


    $("#downloadDecision")
        ?.addEventListener(
            "click",
            () => {

                download(
                    "assurex-decision-report.json",

                    JSON.stringify(
                        {
                            claimId:
                                "CLM-2026-00021",

                            python:
                                "87%",

                            teachableMachine:
                                "82%",

                            decision:
                                "Manual Review Required",

                            confidenceDifference:
                                "5%"

                        },
                        null,
                        2
                    ),

                    "application/json"
                );

            }
        );


    $("#exportClaims")
        ?.addEventListener(
            "click",
            () => {

                download(

                    "assurex-claims.csv",

                    [
                        "Claim ID,Product,Status,Risk,Reviewer",

                        "CLM-2026-00021,Samsung RF28,Manual Review,High,Unassigned",

                        "CLM-2026-00020,LG WM-450,Approved,Low,A. Khan",

                        "CLM-2026-00019,Haier AC-22,Under Evaluation,Medium,—"

                    ].join("\n"),

                    "text/csv"

                );

            }
        );


    $("#exportReadiness")
        ?.addEventListener(
            "click",
            () => {

                download(

                    "assurex-readiness-checklist.csv",

                    [
                        "Artifact,Status",

                        "Project report,READY",

                        "Public GitHub repository,READY",

                        "Complete source code,READY",

                        "Test cases and results,PENDING",

                        "Demonstration video,PENDING",

                        "Technical blog,PENDING"

                    ].join("\n"),

                    "text/csv"

                );

            }
        );


    $("#refreshReadiness")
        ?.addEventListener(
            "click",
            () => {

                $("#gateTitle").textContent =
                    "Readiness check completed";

                $("#readinessScore").textContent =
                    "84%";

                toast(
                    "Readiness checklist refreshed"
                );

            }
        );


    $("#saveProfile")
        ?.addEventListener(
            "click",
            saveProfile
        );


    $("#notifyButton")
        ?.addEventListener(
            "click",
            () =>
                toast(
                    "3 pending notifications"
                )
        );


    $("#uploadDoc")
        ?.addEventListener(
            "click",
            () =>
                $("#filePicker")?.click()
        );


    $("#dropzone")
        ?.addEventListener(
            "click",
            () =>
                $("#filePicker")?.click()
        );


    $("#filePicker")
        ?.addEventListener(
            "change",
            handleDocuments
        );

    $("#addProduct")?.addEventListener("click", () => {
        window.location.href = ('add-product.html')
    })


    $("#addProduct")
        ?.addEventListener(
            "click",
            async () => {

                try {

                    const product = {

                        name:
                            "New Product",

                        createdAt:
                            firebase.firestore.FieldValue.serverTimestamp()

                    };


                    const id =
                        await DbService.createProduct(product);


                    console.log(
                        "Product created:",
                        id
                    );


                    toast(
                        "Product added successfully"
                    );


                }
                catch (error) {

                    console.error(
                        "Product creation failed:",
                        error
                    );


                    toast(
                        error.message
                    );

                }

            });
}


async function saveProfile() {

    const name =
        $("#profileNameInput")
            .value
            .trim();


    if (!name) {

        toast(
            "Name cannot be empty"
        );

        return;

    }


    try {

        if (
            firebaseReady &&
            fbUser.user
        ) {

            await db
                .collection("users")
                .doc(fbUser.user.uid)
                .set(
                    {
                        displayName: name
                    },
                    {
                        merge: true
                    }
                );


            await fbUser.user
                .updateProfile({
                    displayName: name
                });

        }


        fbUser.doc =
            fbUser.doc || {};

        fbUser.doc.displayName =
            name;


        $("#profileName").textContent =
            name;

        $("#userAvatar").textContent =
            initials(name);

        $("#profileAvatarLarge").textContent =
            initials(name);


        toast(
            "Profile saved"
        );

    } catch (error) {

        console.error(error);

        toast(
            "Profile saved locally"
        );

    }

}


/* =========================================================
   DOCUMENTS
========================================================= */

async function handleDocuments(event) {

    const files =
        [...event.target.files];


    if (!files.length) {
        return;
    }


    toast(
        `${files.length} file(s) registering…`
    );


    for (const file of files) {

        const metadata = {

            fileName:
                file.name,

            fileType:
                file.type,

            fileSize:
                file.size,

            filePath:
                "local://" +
                file.name,

            uploadedAtIso:
                new Date().toISOString()

        };


        try {

            await DbService.addDocument(
                metadata
            );

        } catch (error) {

            console.warn(
                "Document metadata failed:",
                error
            );

        }

    }


    toast(
        "Document metadata saved"
    );


    event.target.value = "";

}


/* =========================================================
   READINESS
========================================================= */

function renderArtifacts() {

    const artifacts = [

        ["Project report", "READY"],

        ["Public GitHub repository", "READY"],

        ["Complete source code", "READY"],

        ["Structured warranty dataset", "READY"],

        ["Claim Summary Card dataset", "READY"],

        ["Python model files", "READY"],

        ["Teachable Machine model", "READY"],

        ["Warranty policy files", "READY"],

        ["Model comparison report", "READY"],

        ["Test cases and results", "PENDING"],

        ["Installation instructions", "READY"],

        ["Execution instructions", "READY"],

        ["Deployment URL", "READY"],

        ["Demonstration video", "PENDING"],

        ["Technical blog", "PENDING"],

        ["Team contribution record", "READY"]

    ];


    const list =
        $("#artifactList");


    if (!list) return;


    list.innerHTML =
        artifacts.map(
            item => {

                const ready =
                    item[1] === "READY";


                return `

          <div class="artifact">

            <i class="${ready ? "done" : "pending"}">
              ${ready ? "✓" : "!"}
            </i>

            <div>

              <b>
                ${escapeHtml(item[0])}
              </b>

              <small>
                AssureX submission artifact
              </small>

            </div>

            <span>
              ${item[1]}
            </span>

          </div>

        `;

            }
        ).join("");


    $("#artifactCount").textContent =
        artifacts.length;

}


/* =========================================================
   DOWNLOAD
========================================================= */

function download(
    filename,
    data,
    type
) {

    const blob =
        new Blob(
            [data],
            { type }
        );


    const url =
        URL.createObjectURL(blob);


    const anchor =
        document.createElement("a");


    anchor.href = url;
    anchor.download = filename;


    document.body.appendChild(
        anchor
    );


    anchor.click();


    anchor.remove();


    setTimeout(
        () =>
            URL.revokeObjectURL(url),
        1000
    );

}


/* =========================================================
   SAFE HTML
========================================================= */

function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =========================================================
   SEARCH
========================================================= */

function bindSearch() {

    $("#globalSearch")
        ?.addEventListener(
            "keydown",
            event => {

                if (
                    event.key !== "Enter"
                ) {
                    return;
                }


                const query =
                    event.target.value
                        .trim()
                        .toLowerCase();


                if (!query) {
                    return;
                }


                const matchingCommand =
                    commands.find(
                        item =>
                            (
                                item[0] +
                                " " +
                                item[1]
                            )
                                .toLowerCase()
                                .includes(query)
                    );


                if (matchingCommand) {

                    showPage(
                        matchingCommand[2]
                    );

                    return;

                }


                toast(
                    `Searching for "${query}"`
                );

            }
        );


    $("#claimSearch")
        ?.addEventListener(
            "input",
            event => {

                const query =
                    event.target.value
                        .toLowerCase()
                        .trim();


                document
                    .querySelectorAll(
                        '[data-page="analytics"] .tr'
                    )
                    .forEach(row => {

                        row.style.display =
                            row.textContent
                                .toLowerCase()
                                .includes(query)
                                ? ""
                                : "none";

                    });

            }
        );

}


/* =========================================================
   FIREBASE AUTH LISTENER
========================================================= */

function initFirebaseAuth() {
    if (!window.AuthService || typeof AuthService.onAuthChanged !== "function") {
        console.error("[AssureX] AuthService is not available.");
        return;
    }

    const currentPage =
        (location.pathname.split("/").pop() || "index.html")
            .toLowerCase();

    const publicPages = [
        "index.html",
        "login.html",
        "register.html",
        ""
    ];

    const isPublicPage = publicPages.includes(currentPage);

    AuthService.onAuthChanged(function (user, userDoc) {
        fbUser.user = user || null;
        fbUser.doc = userDoc || null;

        /*
         * USER IS SIGNED IN
         */
        if (user) {

            // Login/register should never remain open after authentication.
            if (
                currentPage === "login.html" ||
                currentPage === "register.html"
            ) {
                window.location.replace("dashboard.html");
                return;
            }

            // index.html remains a public landing page,
            // so do not force the authenticated user away from it.
            if (currentPage === "index.html" || currentPage === "") {
                return;
            }

            // Protected application pages continue normally.
            if (typeof showApp === "function") {
                showApp();
            }

            return;
        }

        /*
         * USER IS SIGNED OUT
         */

        // IMPORTANT:
        // Do NOT redirect login.html to index.html.
        if (currentPage === "login.html") {
            return;
        }

        // Registration is also allowed while signed out.
        if (currentPage === "register.html") {
            return;
        }

        // Landing page is allowed while signed out.
        if (currentPage === "index.html" || currentPage === "") {
            if (typeof showLanding === "function") {
                showLanding();
            }
            return;
        }

        // Any other page is protected.
        if (!isPublicPage) {
            window.location.replace("login.html");
        }
    });
}


/* =========================================================
   HASH ROUTING
========================================================= */

function handleHashRouting() {

    window.addEventListener(
        "hashchange",
        () => {

            const page =
                location.hash
                    .replace("#", "");


            if (
                fbUser.user &&
                pages.includes(page)
            ) {

                showPage(page);

            }

        }
    );

}


/* =========================================================
   INITIALIZATION
========================================================= */

function init() {

    initLandingNavigation();

    initRevealAnimations();

    bindAuthNavigation();

    bindNavigation();

    bindTheme();

    bindCommand();

    bindWizard();

    bindInteractions();

    bindSearch();

    renderArtifacts();

    handleHashRouting();

    initFirebaseAuth();


    /*
      If Firebase isn't configured yet,
      keep the landing page available.
    */

    if (!firebaseReady) {

        console.info(
            "AssureX is running in frontend/demo mode. " +
            "Configure Firebase in app.js to enable authentication and Firestore."
        );

    }

}


/* =========================================================
   START
========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        init
    );

} else {

    init();

}


/* =========================================================
   PUBLIC API
========================================================= */

window.AssureX = {

    firebaseReady,

    showPage,

    showAuth,

    showLanding,

    fbUser: () =>
        fbUser,

    state

};