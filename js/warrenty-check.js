/**
 * AssureX Warranty Check
 *
 * Reads products from Firestore and calculates:
 *
 * ACTIVE
 * EXPIRING SOON
 * EXPIRED
 */

document.addEventListener("DOMContentLoaded", () => {

    // ============================================
    // ELEMENTS
    // ============================================

    const warrantyList =
        document.getElementById("warrantyList");

    const loading =
        document.getElementById("loading");

    const emptyState =
        document.getElementById("emptyState");

    const message =
        document.getElementById("message");

    const searchInput =
        document.getElementById("searchWarranty");

    const refreshButton =
        document.getElementById("refreshWarranty");


    const totalProducts =
        document.getElementById("totalProducts");

    const activeWarranties =
        document.getElementById("activeWarranties");

    const expiringWarranties =
        document.getElementById("expiringWarranties");

    const expiredWarranties =
        document.getElementById("expiredWarranties");


    const allCount =
        document.getElementById("allCount");

    const activeCount =
        document.getElementById("activeCount");

    const expiringCount =
        document.getElementById("expiringCount");

    const expiredCount =
        document.getElementById("expiredCount");


    let products = [];

    let currentFilter = "all";

    let searchQuery = "";


    // ============================================
    // MESSAGE
    // ============================================

    function showMessage(text) {

        message.hidden = false;

        message.className =
            "message error";

        message.textContent = text;

    }


    function hideMessage() {

        message.hidden = true;

    }


    // ============================================
    // GET USER
    // ============================================

    function getCurrentUser() {

        if (
            window.fbAuth &&
            window.fbAuth.currentUser
        ) {

            return window.fbAuth.currentUser;

        }


        if (
            window.firebase &&
            typeof firebase.auth === "function"
        ) {

            return firebase.auth().currentUser;

        }


        return null;

    }


    // ============================================
    // FETCH PRODUCTS
    // ============================================

    async function loadWarrantyData() {

        try {

            hideMessage();

            loading.hidden = false;

            warrantyList.innerHTML = "";

            emptyState.hidden = true;


            // ------------------------------------
            // FIRESTORE
            // ------------------------------------

            if (!window.fbDb) {

                throw new Error(
                    "Firestore is not initialized."
                );

            }


            // ------------------------------------
            // USER
            // ------------------------------------

            const user =
                getCurrentUser();


            if (!user) {

                throw new Error(
                    "Please sign in before checking warranties."
                );

            }


            console.log(
                "[AssureX] Checking warranties for:",
                user.uid
            );


            // ------------------------------------
            // FETCH PRODUCTS
            // ------------------------------------

            const snapshot =
                await window.fbDb
                    .collection("products")
                    .where(
                        "user_id",
                        "==",
                        user.uid
                    )
                    .get();


            products =
                snapshot.docs.map(doc => {

                    const data =
                        doc.data();


                    return {

                        firestore_id:
                            doc.id,

                        ...data,

                        warranty:
                            calculateWarranty(data)

                    };

                });


            console.log(
                "[AssureX] Warranty results:",
                products
            );


            updateSummary();

            render();


        } catch (error) {

            console.error(
                "[AssureX] Warranty check failed:",
                error
            );


            showMessage(
                error.message ||
                "Could not check warranties."
            );


        } finally {

            loading.hidden = true;

        }

    }


    // ============================================
    // CALCULATE WARRANTY
    // ============================================

    function calculateWarranty(product) {

        const purchaseDate =
            parseDate(
                product.purchase_date
            );


        const warrantyMonths =
            Number(
                product.warranty_months || 0
            );


        const extendedMonths =
            Number(
                product.extended_warranty_months || 0
            );


        const totalMonths =
            warrantyMonths +
            extendedMonths;


        // ----------------------------------------
        // NO DATE
        // ----------------------------------------

        if (!purchaseDate) {

            return {

                status: "unknown",

                label: "Unknown",

                expiryDate: null,

                daysRemaining: null,

                totalMonths

            };

        }


        // ----------------------------------------
        // NO WARRANTY
        // ----------------------------------------

        if (totalMonths <= 0) {

            return {

                status: "expired",

                label: "No Warranty",

                expiryDate: purchaseDate,

                daysRemaining: 0,

                totalMonths

            };

        }


        // ----------------------------------------
        // EXPIRY DATE
        // ----------------------------------------

        const expiryDate =
            new Date(purchaseDate);


        expiryDate.setMonth(
            expiryDate.getMonth() +
            totalMonths
        );


        // ----------------------------------------
        // DAYS REMAINING
        // ----------------------------------------

        const today =
            new Date();


        today.setHours(
            0,
            0,
            0,
            0
        );


        expiryDate.setHours(
            0,
            0,
            0,
            0
        );


        const difference =
            expiryDate.getTime() -
            today.getTime();


        const daysRemaining =
            Math.ceil(
                difference /
                (1000 * 60 * 60 * 24)
            );


        // ----------------------------------------
        // EXPIRED
        // ----------------------------------------

        if (daysRemaining < 0) {

            return {

                status: "expired",

                label: "Expired",

                expiryDate,

                daysRemaining,

                totalMonths

            };

        }


        // ----------------------------------------
        // EXPIRING SOON
        // ----------------------------------------

        const alertThreshold = Math.max(0, Math.min(365, Number(localStorage.getItem("assurexWarrantyAlertDays") || 30)));
        if (daysRemaining <= alertThreshold) {

            return {

                status: "expiring",

                label: "Expiring Soon",

                expiryDate,

                daysRemaining,

                totalMonths

            };

        }


        // ----------------------------------------
        // ACTIVE
        // ----------------------------------------

        return {

            status: "active",

            label: "Active",

            expiryDate,

            daysRemaining,

            totalMonths

        };

    }


    // ============================================
    // SUMMARY
    // ============================================

    function updateSummary() {

        const active =
            products.filter(
                p => p.warranty.status === "active"
            ).length;


        const expiring =
            products.filter(
                p => p.warranty.status === "expiring"
            ).length;


        const expired =
            products.filter(
                p => p.warranty.status === "expired"
            ).length;


        totalProducts.textContent =
            products.length;


        activeWarranties.textContent =
            active;


        expiringWarranties.textContent =
            expiring;


        expiredWarranties.textContent =
            expired;


        allCount.textContent =
            products.length;


        activeCount.textContent =
            active;


        expiringCount.textContent =
            expiring;


        expiredCount.textContent =
            expired;

    }


    // ============================================
    // FILTER
    // ============================================

    function getFilteredProducts() {

        let result =
            [...products];


        // ----------------------------------------
        // STATUS FILTER
        // ----------------------------------------

        if (currentFilter !== "all") {

            result =
                result.filter(
                    product =>
                        product.warranty.status ===
                        currentFilter
                );

        }


        // ----------------------------------------
        // SEARCH
        // ----------------------------------------

        if (searchQuery) {

            result =
                result.filter(product => {

                    const text = [

                        product.name,

                        product.brand,

                        product.category,

                        product.model_number,

                        product.serial_number,

                        product.product_id

                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();


                    return text.includes(
                        searchQuery
                    );

                });

        }


        return result;

    }


    // ============================================
    // RENDER
    // ============================================

    function render() {

        const filtered =
            getFilteredProducts();


        warrantyList.innerHTML = "";


        if (!filtered.length) {

            emptyState.hidden = false;

            return;

        }


        emptyState.hidden = true;


        filtered.forEach(product => {

            const row =
                document.createElement("div");


            row.className =
                "table-row";


            // ------------------------------------
            // PRODUCT
            // ------------------------------------

            const productCell =
                document.createElement("div");


            productCell.className =
                "product";


            const productName =
                document.createElement("strong");


            productName.textContent =
                product.name ||
                "Unnamed Product";


            const model =
                document.createElement("small");


            model.textContent =
                `${product.brand || ""} ${product.model_number || ""
                    }`.trim() ||
                "No model";


            productCell.appendChild(
                productName
            );


            productCell.appendChild(
                model
            );


            // ------------------------------------
            // SERIAL
            // ------------------------------------

            const serial =
                document.createElement("span");


            serial.textContent =
                product.serial_number ||
                "-";


            // ------------------------------------
            // PURCHASE DATE
            // ------------------------------------

            const purchaseDate =
                document.createElement("span");


            purchaseDate.textContent =
                formatDate(
                    product.purchase_date
                );


            // ------------------------------------
            // WARRANTY PERIOD
            // ------------------------------------

            const warrantyPeriod =
                document.createElement("span");


            warrantyPeriod.textContent =
                `${product.warranty.totalMonths} months`;


            // ------------------------------------
            // EXPIRY DATE
            // ------------------------------------

            const expiry =
                document.createElement("span");


            expiry.textContent =
                product.warranty.expiryDate
                    ? formatDate(
                        product.warranty.expiryDate
                    )
                    : "-";


            // ------------------------------------
            // STATUS
            // ------------------------------------

            const statusCell =
                document.createElement("span");


            const status =
                document.createElement("span");


            status.className =
                `status ${product.warranty.status
                }`;


            status.textContent =
                getStatusText(
                    product.warranty
                );


            statusCell.appendChild(
                status
            );


            // ------------------------------------
            // APPEND
            // ------------------------------------

            row.appendChild(
                productCell
            );

            row.appendChild(
                serial
            );

            row.appendChild(
                purchaseDate
            );

            row.appendChild(
                warrantyPeriod
            );

            row.appendChild(
                expiry
            );

            row.appendChild(
                statusCell
            );


            warrantyList.appendChild(
                row
            );

        });

    }


    // ============================================
    // STATUS TEXT
    // ============================================

    function getStatusText(warranty) {

        if (
            warranty.status === "active"
        ) {

            return `Active • ${warranty.daysRemaining} days left`;

        }


        if (
            warranty.status === "expiring"
        ) {

            return `Expiring • ${warranty.daysRemaining} days left`;

        }


        if (
            warranty.status === "expired"
        ) {

            return "Expired";

        }


        return "Unknown";

    }


    // ============================================
    // DATE PARSER
    // ============================================

    function parseDate(value) {

        if (!value) {
            return null;
        }


        // Firestore Timestamp

        if (
            typeof value.toDate ===
            "function"
        ) {

            return value.toDate();

        }


        // Firestore timestamp object

        if (
            typeof value.seconds ===
            "number"
        ) {

            return new Date(
                value.seconds * 1000
            );

        }


        const date =
            new Date(value);


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return null;

        }


        return date;

    }


    // ============================================
    // FORMAT DATE
    // ============================================

    function formatDate(value) {

        const date =
            parseDate(value);


        if (!date) {
            return "-";
        }


        return date.toLocaleDateString(
            undefined,
            {
                year: "numeric",
                month: "short",
                day: "numeric"
            }
        );

    }


    // ============================================
    // FILTER BUTTONS
    // ============================================

    document
        .querySelectorAll(".filter")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(".filter")
                        .forEach(btn => {

                            btn.classList.remove(
                                "active"
                            );

                        });


                    button.classList.add(
                        "active"
                    );


                    currentFilter =
                        button.dataset.filter;


                    render();

                }
            );

        });


    // ============================================
    // SEARCH
    // ============================================

    searchInput.addEventListener(
        "input",
        event => {

            searchQuery =
                event.target.value
                    .trim()
                    .toLowerCase();


            render();

        }
    );


    // ============================================
    // REFRESH
    // ============================================

    refreshButton.addEventListener(
        "click",
        loadWarrantyData
    );


    // ============================================
    // START
    // ============================================

    loadWarrantyData();

});