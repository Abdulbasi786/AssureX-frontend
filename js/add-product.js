document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("addProductForm");
  const message = document.getElementById("message");

  const show = (text, type) => {
    message.hidden = false;
    message.className = "message " + type;
    message.textContent = text;
  };

  const value = name => form.elements[name].value.trim();

  // Populate the user ID from Firebase Authentication.
  // Firestore rules require products.user_id == request.auth.uid.
  if (window.fbAuth) {
    window.fbAuth.onAuthStateChanged((user) => {
      const userIdField = document.getElementById("user_id");

      if (userIdField) {
        if (user) {
          userIdField.value = user.uid;
          userIdField.readOnly = true;
        } else {
          userIdField.value = "";
          userIdField.readOnly = true;
        }
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      // Firebase availability
      if (
        !window.fbDb ||
        typeof window.fbDb.collection !== "function"
      ) {
        throw new Error(
          "Firebase Firestore is not initialized. Load firebase-config.js first."
        );
      }

      if (!window.fbAuth) {
        throw new Error(
          "Firebase Authentication is not initialized."
        );
      }

      // Require an authenticated Firebase user.
      const firebaseUser = window.fbAuth.currentUser;

      if (!firebaseUser) {
        show(
          "You must be signed in before adding a product.",
          "error"
        );
        return;
      }

      // Build product payload.
      // IMPORTANT: user_id must be the Firebase Auth UID because
      // the Firestore create rule checks it against request.auth.uid.
      const payload = {
        product_id: value("product_id"),
        name: value("name"),
        brand: value("brand"),
        category: value("category"),
        model_number: value("model_number"),
        serial_number: value("serial_number"),
        price: Number(value("price")),
        retailer: value("retailer"),
        purchase_date: value("purchase_date"),
        warranty_months: Number(value("warranty_months")),
        extended_warranty_months:
          Number(value("extended_warranty_months") || 0),
        warranty_provider: value("warranty_provider"),
        service_center: value("service_center"),
        coverage_conditions: value("coverage_conditions"),
        exclusions: value("exclusions"),

        // Firebase Authentication UID
        user_id: firebaseUser.uid
      };

      // Validation
      if (!payload.product_id) {
        show("Product ID is required.", "error");
        return;
      }

      if (!Number.isFinite(payload.price) || payload.price < 0) {
        show("Enter a valid product price.", "error");
        return;
      }

      if (
        !Number.isInteger(payload.warranty_months) ||
        payload.warranty_months < 0
      ) {
        show("Enter valid warranty months.", "error");
        return;
      }

      if (
        !Number.isInteger(payload.extended_warranty_months) ||
        payload.extended_warranty_months < 0
      ) {
        show("Enter valid extended warranty months.", "error");
        return;
      }

      // Write directly to products/{product_id}.
      await window.fbDb
        .collection("products")
        .doc(payload.product_id)
        .set({
          ...payload,
          created_at:
            firebase.firestore.FieldValue.serverTimestamp(),
          updated_at:
            firebase.firestore.FieldValue.serverTimestamp()
        });

      console.log(
        "[AssureX] Product created:",
        payload.product_id
      );

      show(
        "Product added successfully to Firestore.",
        "success"
      );

      form.reset();

      const extendedWarranty =
        document.getElementById("extended_warranty_months");

      if (extendedWarranty) {
        extendedWarranty.value = "0";
      }

      // Restore the authenticated UID after form.reset().
      const userIdField = document.getElementById("user_id");
      if (userIdField) {
        userIdField.value = firebaseUser.uid;
        userIdField.readOnly = true;
      }

      setTimeout(() => {
        if (document.referrer) {
          history.back();
        }
      }, 1000);

    } catch (error) {
      console.error(
        "[AssureX] Add product failed:",
        error
      );

      if (
        error.code === "permission-denied" ||
        error.code === "PERMISSION_DENIED"
      ) {
        show(
          "Permission denied. Make sure you are signed in and that the published Firestore rules allow your authenticated UID to create products.",
          "error"
        );
      } else {
        show(
          error.message || "Could not add product.",
          "error"
        );
      }
    }
  });
});
