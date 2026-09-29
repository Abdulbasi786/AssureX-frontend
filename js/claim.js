/*
 * AssureX Claim Registration
 * -------------------------------------------------------------
 * IMPORTANT ML CONFIGURATION
 *
 * The browser cannot execute your Python .pkl/.joblib model directly.
 * Configure your Python/Flask/FastAPI prediction endpoint here.
 *
 * Expected request:
 * POST ML_CONFIG.PYTHON_API_URL
 * Content-Type: application/json
 *
 * {
 *   "claim_id": "...",
 *   "user_id": "...",
 *   "product": {...},
 *   "fault": {...},
 *   "repair_history": {...},
 *   "evidence": {...},
 *   "derived_features": {...}
 * }
 *
 * Expected response:
 * {
 *   "prediction": "VALID",
 *   "confidence": {
 *      "VALID": 0.87,
 *      "INVALID": 0.08,
 *      "MANUAL_REVIEW": 0.05
 *   },
 *   "explanation": "..."
 * }
 *
 * If your API uses different field names, change normalizePrediction().
 */

const ML_CONFIG = {
  // CHANGE THIS to your deployed/local Python API.
  PYTHON_API_URL: "http://127.0.0.1:5000/api/predict-claim",

  // Set true after the Python API is available.
  ENABLE_PYTHON_MODEL: true,

  // Optional second model integration.
  // Your SRS requires Google Teachable Machine comparison.
  ENABLE_TEACHABLE_MACHINE: false,
  TEACHABLE_MACHINE_API_URL: "",

  // Claims with low confidence should normally go to manual review.
  MANUAL_REVIEW_THRESHOLD: 0.60
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"];

let currentUser = null;
let currentCustomer = null;
let products = [];
let selectedProduct = null;
let generatedClaimId = "";
let lastPrediction = null;

const $ = (id) => document.getElementById(id);

function db() {
  if (window.fbDb) return window.fbDb;
  if (window.db) return window.db;
  if (window.firebase?.firestore) return firebase.firestore();
  throw new Error("Firestore is not initialized.");
}

function auth() {
  if (window.fbAuth) return window.fbAuth;
  if (window.firebase?.auth) return firebase.auth();
  throw new Error("Firebase Auth is not initialized.");
}

function storage() {
  if (window.fbStorage) return window.fbStorage;
  if (window.firebase?.storage) return firebase.storage();
  throw new Error("Firebase Storage is not initialized.");
}

function makeClaimId() {
  const date = new Date();
  const y = date.getFullYear();
  const random = Math.floor(10000 + Math.random() * 90000);
  return `CLM-${y}-${random}`;
}

function showMessage(text, type = "success") {
  const el = $("message");
  el.textContent = text;
  el.className = `alert ${type}`;
  el.hidden = false;
}

function hideMessage() {
  $("message").hidden = true;
}

function escapeText(value) {
  return String(value ?? "—");
}

function formatDate(value) {
  if (!value) return "—";
  try {
    if (value.toDate) value = value.toDate();
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
  } catch {
    return "—";
  }
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
}

function calculateWarranty(product) {
  const purchase = product.purchase_date;
  if (!purchase) return { status: "UNKNOWN", expiry: null, remainingDays: null };

  const start = new Date(purchase);
  if (Number.isNaN(start.getTime())) {
    return { status: "UNKNOWN", expiry: null, remainingDays: null };
  }

  const months = Number(product.warranty_months || 0) +
    Number(product.extended_warranty_months || 0);

  const expiry = addMonths(start, months);
  const remainingDays = Math.ceil((expiry - new Date()) / 86400000);

  let status = "EXPIRED";
  if (remainingDays > 30) status = "ACTIVE";
  else if (remainingDays >= 0) status = "EXPIRING_SOON";

  return { status, expiry, remainingDays };
}

async function getCurrentUser() {
  const a = auth();
  if (a.currentUser) return a.currentUser;

  return new Promise((resolve, reject) => {
    const unsubscribe = a.onAuthStateChanged((user) => {
      unsubscribe();
      if (!user) reject(new Error("You must be logged in to submit a claim."));
      else resolve(user);
    });
  });
}

async function loadCustomer(user) {
  const ref = db().collection("users").doc(user.uid);
  const snap = await ref.get();

  currentCustomer = snap.exists ? snap.data() : {};

  $("customerUserId").textContent = user.uid;
  $("customerName").textContent =
    currentCustomer.name ||
    currentCustomer.full_name ||
    currentCustomer.displayName ||
    user.displayName ||
    "Customer";

  $("customerEmail").textContent =
    currentCustomer.email || user.email || "—";

  $("customerPhone").textContent =
    currentCustomer.phone ||
    currentCustomer.phone_number ||
    "—";
}

async function loadProducts(user) {
  const select = $("productSelect");
  select.innerHTML = `<option value="">Loading products…</option>`;

  const snap = await db()
    .collection("products")
    .where("user_id", "==", user.uid)
    .get();

  products = snap.docs.map(doc => ({
    firestore_id: doc.id,
    ...doc.data()
  }));

  if (!products.length) {
    select.innerHTML = `<option value="">No registered products found</option>`;
    addValidation("No products are registered under your account.", "warning");
    return;
  }

  select.innerHTML = `<option value="">Select a registered product</option>`;

  products.forEach(product => {
    const option = document.createElement("option");
    option.value = product.firestore_id;
    option.textContent =
      `${product.name || "Product"} — ${product.model_number || "No model"} — ${product.serial_number || "No serial"}`;
    select.appendChild(option);
  });
}

function renderProduct(product) {
  selectedProduct = product;

  $("productDetails").classList.remove("hidden");

  $("pProductId").textContent = escapeText(product.product_id);
  $("pName").textContent = escapeText(product.name);
  $("pBrand").textContent = escapeText(product.brand);
  $("pCategory").textContent = escapeText(product.category);
  $("pModel").textContent = escapeText(product.model_number);
  $("pSerial").textContent = escapeText(product.serial_number);
  $("pPurchaseDate").textContent = formatDate(product.purchase_date);

  const warrantyMonths =
    Number(product.warranty_months || 0) +
    Number(product.extended_warranty_months || 0);

  $("pWarranty").textContent = `${warrantyMonths} month(s)`;
  $("pProvider").textContent = escapeText(product.warranty_provider);

  const warranty = calculateWarranty(product);
  $("pWarrantyStatus").textContent =
    warranty.status === "ACTIVE" ? `Active — ${warranty.remainingDays} days left` :
    warranty.status === "EXPIRING_SOON" ? `Expiring — ${warranty.remainingDays} days left` :
    warranty.status === "EXPIRED" ? `Expired — ${formatDate(warranty.expiry)}` :
    "Unknown";

  runValidationChecks();
}

function addValidation(text, type) {
  const list = $("validationList");
  const div = document.createElement("div");
  div.className = `validation-item ${type}`;
  div.innerHTML = `<span>${type === "success" ? "✓" : type === "danger" ? "!" : "•"}</span> ${escapeText(text)}`;
  list.appendChild(div);
}

function runValidationChecks() {
  const list = $("validationList");
  list.innerHTML = "";

  if (!selectedProduct) {
    addValidation("Select a product to begin validation.", "pending");
    return false;
  }

  const warranty = calculateWarranty(selectedProduct);

  if (warranty.status === "ACTIVE") {
    addValidation(`Warranty is active. ${warranty.remainingDays} day(s) remain.`, "success");
  } else if (warranty.status === "EXPIRING_SOON") {
    addValidation(`Warranty is approaching expiry. ${warranty.remainingDays} day(s) remain.`, "warning");
  } else if (warranty.status === "EXPIRED") {
    addValidation(`Warranty expired on ${formatDate(warranty.expiry)}.`, "danger");
  } else {
    addValidation("Warranty dates could not be verified.", "warning");
  }

  const requiredFiles = [
    ["Purchase invoice", $("purchaseInvoice").files.length],
    ["Warranty document", $("warrantyDocument").files.length],
    ["Repair history", $("repairHistoryFile").files.length]
  ];

  requiredFiles.forEach(([label, exists]) => {
    if (exists) addValidation(`${label} provided.`, "success");
    else addValidation(`${label} not provided.`, "warning");
  });

  if ($("productPhotos").files.length) {
    addValidation(`${$("productPhotos").files.length} product photo(s) provided.`, "success");
  } else {
    addValidation("Product photos not provided.", "warning");
  }

  return true;
}

function collectFiles() {
  return {
    purchase_invoice: $("purchaseInvoice").files[0] || null,
    warranty_document: $("warrantyDocument").files[0] || null,
    repair_history: $("repairHistoryFile").files[0] || null,
    product_photos: Array.from($("productPhotos").files || [])
  };
}

function validateFile(file) {
  if (!file) return true;
  if (!ALLOWED_DOC_TYPES.includes(file.type)) {
    throw new Error(`${file.name}: unsupported file type.`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`${file.name}: maximum file size is 10 MB.`);
  }
  return true;
}

function fileMeta(file) {
  if (!file) return null;
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    last_modified: file.lastModified
  };
}

async function uploadFile(file, userId, claimId, category) {
  if (!file) return null;

  validateFile(file);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `claims/${userId}/${claimId}/${category}/${Date.now()}_${safeName}`;
  const ref = storage().ref().child(path);

  const snapshot = await ref.put(file, {
    contentType: file.type
  });

  const url = await snapshot.ref.getDownloadURL();

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    storage_path: path,
    download_url: url,
    uploaded_at: new Date().toISOString()
  };
}

/*
 * Client-side OCR.
 * This is useful for extracting text from invoices/warranty/repair documents.
 * Production systems should also perform OCR on the server so the result
 * cannot be trusted solely from browser-side processing.
 */
async function runOCR(file, label) {
  if (!file || !file.type.startsWith("image/")) {
    return {
      label,
      status: "NOT_RUN",
      text: "",
      reason: "OCR is run here for image documents. PDFs should be processed by the Python/backend OCR service."
    };
  }

  if (!window.Tesseract) {
    return {
      label,
      status: "UNAVAILABLE",
      text: "",
      reason: "Tesseract.js was not loaded."
    };
  }

  try {
    const result = await Tesseract.recognize(file, "eng", {
      logger: () => {}
    });

    const text = result.data.text || "";

    return {
      label,
      status: text.trim() ? "EXTRACTED" : "NO_TEXT",
      text: text.slice(0, 12000)
    };
  } catch (error) {
    return {
      label,
      status: "FAILED",
      text: "",
      reason: error.message
    };
  }
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function verifyOCRText(ocrText, product) {
  const text = normalizeText(ocrText);

  if (!text) {
    return {
      verified: false,
      checks: [],
      reason: "No OCR text available."
    };
  }

  const checks = [];

  const serial = normalizeText(product.serial_number);
  const model = normalizeText(product.model_number);
  const brand = normalizeText(product.brand);

  if (serial) {
    checks.push({
      field: "Serial Number",
      expected: product.serial_number,
      found: text.includes(serial),
      message: text.includes(serial) ? "Serial number found." : "Serial number not found."
    });
  }

  if (model) {
    checks.push({
      field: "Model Number",
      expected: product.model_number,
      found: text.includes(model),
      message: text.includes(model) ? "Model number found." : "Model number not found."
    });
  }

  if (brand) {
    checks.push({
      field: "Brand",
      expected: product.brand,
      found: text.includes(brand),
      message: text.includes(brand) ? "Brand found." : "Brand not found."
    });
  }

  return {
    verified: checks.length > 0 && checks.every(c => c.found),
    checks
  };
}

async function analyzeEvidenceOCR() {
  const files = collectFiles();

  const documentFiles = [
    [files.purchase_invoice, "Purchase Invoice"],
    [files.warranty_document, "Warranty Document"],
    [files.repair_history, "Repair History"]
  ].filter(([file]) => file);

  $("ocrPanel").classList.remove("hidden");
  $("ocrStatus").textContent = "Processing";
  $("ocrStatus").className = "status-chip pending";
  $("ocrResults").innerHTML = "";

  if (!documentFiles.length) {
    $("ocrStatus").textContent = "No documents";
    $("ocrResults").innerHTML =
      `<div class="ocr-result"><strong>No document evidence selected</strong><span>Upload an invoice, warranty document, or repair record for OCR analysis.</span></div>`;
    return [];
  }

  const results = [];

  for (const [file, label] of documentFiles) {
    const result = await runOCR(file, label);

    if (selectedProduct && result.text) {
      result.verification = verifyOCRText(result.text, selectedProduct);
    }

    results.push(result);

    const verificationText =
      result.verification
        ? result.verification.checks.map(c =>
            `${c.field}: ${c.found ? "MATCH" : "NOT FOUND"}`
          ).join(" • ")
        : result.reason || "OCR text extraction completed.";

    const div = document.createElement("div");
    div.className = "ocr-result";
    div.innerHTML = `
      <strong>${escapeText(label)} — ${escapeText(result.status)}</strong>
      <span>${escapeText(verificationText)}</span>
    `;
    $("ocrResults").appendChild(div);
  }

  const hasMismatch = results.some(r =>
    r.verification && r.verification.checks.some(c => !c.found)
  );

  $("ocrStatus").textContent = hasMismatch ? "Mismatch Found" : "Processed";
  $("ocrStatus").className = `status-chip ${hasMismatch ? "danger" : "success"}`;

  return results;
}

function updateFileName(inputId, outputId) {
  const files = Array.from($(inputId).files || []);
  $(outputId).textContent = files.length
    ? files.map(f => f.name).join(", ")
    : "No file selected";
}

function buildClaimPayload(ocrResults = []) {
  const files = collectFiles();
  const warranty = calculateWarranty(selectedProduct);

  const repairHistory = {
    has_repair_history: $("hasRepairHistory").value,
    authorized_service_center: $("authorizedRepair").value,
    last_repair_date: $("repairDate").value || null,
    repair_center: $("repairCenter").value.trim(),
    replaced_parts: $("replacedParts").value.trim(),
    repair_cost: Number($("repairCost").value || 0),
    details: $("repairDetails").value.trim()
  };

  return {
    claim_id: generatedClaimId,
    user_id: currentUser.uid,
    customer: {
      user_id: currentUser.uid,
      name: currentCustomer?.name || currentCustomer?.full_name || currentUser.displayName || "",
      email: currentCustomer?.email || currentUser.email || "",
      phone: currentCustomer?.phone || currentCustomer?.phone_number || ""
    },

    product_id: selectedProduct.product_id,
    product_firestore_id: selectedProduct.firestore_id,

    product: {
      product_id: selectedProduct.product_id,
      name: selectedProduct.name,
      brand: selectedProduct.brand,
      category: selectedProduct.category,
      model_number: selectedProduct.model_number,
      serial_number: selectedProduct.serial_number,
      price: Number(selectedProduct.price || 0),
      retailer: selectedProduct.retailer || "",
      purchase_date: selectedProduct.purchase_date || null,
      warranty_months: Number(selectedProduct.warranty_months || 0),
      extended_warranty_months: Number(selectedProduct.extended_warranty_months || 0),
      warranty_provider: selectedProduct.warranty_provider || "",
      service_center: selectedProduct.service_center || "",
      coverage_conditions: selectedProduct.coverage_conditions || "",
      exclusions: selectedProduct.exclusions || ""
    },

    fault: {
      type: $("faultType").value,
      occurrence_date: $("faultDate").value,
      description: $("faultDescription").value.trim()
    },

    repair_history: repairHistory,

    evidence: {
      purchase_invoice: fileMeta(files.purchase_invoice),
      warranty_document: fileMeta(files.warranty_document),
      repair_history: fileMeta(files.repair_history),
      product_photos: files.product_photos.map(fileMeta)
    },

    ocr: ocrResults.map(r => ({
      label: r.label,
      status: r.status,
      extracted_text: r.text || "",
      verification: r.verification || null
    })),

    derived_features: {
      warranty_status: warranty.status,
      warranty_expiry_date: warranty.expiry ? warranty.expiry.toISOString() : null,
      warranty_remaining_days: warranty.remainingDays,
      product_age_days: selectedProduct.purchase_date
        ? Math.max(0, Math.floor((new Date() - new Date(selectedProduct.purchase_date)) / 86400000))
        : null,
      missing_document_count: [
        files.purchase_invoice,
        files.warranty_document,
        files.repair_history
      ].filter(Boolean).length === 0 ? 3 : [
        files.purchase_invoice,
        files.warranty_document,
        files.repair_history
      ].filter(Boolean).length,
      product_photo_count: files.product_photos.length
    },

    submitted_at: new Date().toISOString(),
    status: "SUBMITTED"
  };
}

/*
 * This is the adapter between the HTML page and your Python model.
 * The actual trained model stays on your Python server.
 */
async function predictWithPythonModel(claimPayload) {
  if (!ML_CONFIG.ENABLE_PYTHON_MODEL) {
    return {
      prediction: "MANUAL_REVIEW",
      confidence: {
        VALID: 0,
        INVALID: 0,
        MANUAL_REVIEW: 1
      },
      explanation: "Python model is disabled in ML_CONFIG."
    };
  }

  if (!ML_CONFIG.PYTHON_API_URL) {
    throw new Error("Python ML API URL is not configured.");
  }

  const response = await fetch(ML_CONFIG.PYTHON_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(claimPayload)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ML API error ${response.status}: ${body || "Prediction failed."}`);
  }

  const result = await response.json();
  return normalizePrediction(result);
}

function normalizePrediction(result) {
  const prediction = String(
    result.prediction ||
    result.label ||
    result.predicted_class ||
    "MANUAL_REVIEW"
  ).toUpperCase().replace(/\s+/g, "_");

  const sourceConfidence = result.confidence || result.probabilities || result.class_probabilities || {};

  let confidence = {
    VALID: Number(sourceConfidence.VALID ?? sourceConfidence["Valid Claim"] ?? sourceConfidence.valid ?? 0),
    INVALID: Number(sourceConfidence.INVALID ?? sourceConfidence["Invalid Claim"] ?? sourceConfidence.invalid ?? 0),
    MANUAL_REVIEW: Number(
      sourceConfidence.MANUAL_REVIEW ??
      sourceConfidence["Manual Review"] ??
      sourceConfidence.manual_review ??
      sourceConfidence["Manual Review Claim"] ??
      0
    )
  };

  // Support APIs returning percentages such as 87 instead of 0.87.
  if (Math.max(...Object.values(confidence)) > 1) {
    confidence = Object.fromEntries(
      Object.entries(confidence).map(([k, v]) => [k, v / 100])
    );
  }

  const topConfidence = Math.max(...Object.values(confidence));

  let finalPrediction = prediction;

  // Low-confidence claims are routed to manual review per SRS intent.
  if (topConfidence < ML_CONFIG.MANUAL_REVIEW_THRESHOLD) {
    finalPrediction = "MANUAL_REVIEW";
  }

  return {
    prediction: finalPrediction,
    confidence,
    explanation:
      result.explanation ||
      result.reason ||
      "Prediction returned by the configured Python classification model.",
    model_version: result.model_version || null
  };
}

function renderPrediction(result) {
  lastPrediction = result;

  $("predictionState").classList.add("hidden");
  $("predictionResult").classList.remove("hidden");

  $("predictionLabel").textContent =
    result.prediction.replace("_", " ");

  $("validConfidence").textContent =
    `${Math.round(result.confidence.VALID * 100)}%`;

  $("invalidConfidence").textContent =
    `${Math.round(result.confidence.INVALID * 100)}%`;

  $("manualConfidence").textContent =
    `${Math.round(result.confidence.MANUAL_REVIEW * 100)}%`;

  $("predictionExplanation").textContent = result.explanation || "";
}

async function saveClaim(claimPayload, uploadedEvidence) {
  const finalData = {
    ...claimPayload,
    evidence: uploadedEvidence,
    ml_prediction: lastPrediction || null,
    model_version: lastPrediction?.model_version || null,
    updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  };

  await db().collection("claims").doc(generatedClaimId).set(finalData);
}

async function uploadAllEvidence(files) {
  const output = {
    purchase_invoice: null,
    warranty_document: null,
    repair_history: null,
    product_photos: []
  };

  if (files.purchase_invoice) {
    output.purchase_invoice =
      await uploadFile(files.purchase_invoice, currentUser.uid, generatedClaimId, "purchase_invoice");
  }

  if (files.warranty_document) {
    output.warranty_document =
      await uploadFile(files.warranty_document, currentUser.uid, generatedClaimId, "warranty_document");
  }

  if (files.repair_history) {
    output.repair_history =
      await uploadFile(files.repair_history, currentUser.uid, generatedClaimId, "repair_history");
  }

  for (const photo of files.product_photos) {
    output.product_photos.push(
      await uploadFile(photo, currentUser.uid, generatedClaimId, "product_photos")
    );
  }

  return output;
}

function basicFormValidation() {
  if (!selectedProduct) {
    throw new Error("Please select a registered product.");
  }

  if (!$("faultType").value) {
    throw new Error("Please select the fault type.");
  }

  if (!$("faultDate").value) {
    throw new Error("Please provide the fault occurrence date.");
  }

  if (!$("faultDescription").value.trim()) {
    throw new Error("Please describe the fault.");
  }

  const files = collectFiles();
  Object.values(files).forEach(value => {
    if (Array.isArray(value)) value.forEach(validateFile);
    else validateFile(value);
  });

  return true;
}

async function submitClaim(event) {
  event.preventDefault();
  hideMessage();

  const button = $("submitBtn");
  button.disabled = true;
  button.querySelector("span").textContent = "Uploading & Analyzing…";

  try {
    basicFormValidation();
    runValidationChecks();

    const ocrResults = await analyzeEvidenceOCR();
    const payload = buildClaimPayload(ocrResults);

    /*
     * Step 1: upload supporting evidence to Firebase Storage.
     * Step 2: save the structured claim to Firestore.
     * Step 3: call Python model.
     * Step 4: update Firestore with prediction.
     *
     * Saving first means the claim exists even if the ML service temporarily
     * fails; it can then be sent to a manual-review/retry queue.
     */

    const uploadedEvidence = await uploadAllEvidence(collectFiles());
    await saveClaim(payload, uploadedEvidence);

    let prediction;

    try {
      prediction = await predictWithPythonModel({
        ...payload,
        evidence: uploadedEvidence
      });

      renderPrediction(prediction);

      await db().collection("claims").doc(generatedClaimId).update({
        ml_prediction: prediction,
        status:
          prediction.prediction === "VALID" ? "AI_VALIDATION_COMPLETE" :
          prediction.prediction === "INVALID" ? "AI_INVALID" :
          "MANUAL_REVIEW",
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      });

      showMessage(
        `Claim ${generatedClaimId} submitted successfully. ML prediction: ${prediction.prediction.replace("_", " ")}.`,
        "success"
      );
    } catch (mlError) {
      const fallback = {
        prediction: "MANUAL_REVIEW",
        confidence: {
          VALID: 0,
          INVALID: 0,
          MANUAL_REVIEW: 1
        },
        explanation: `The claim was saved, but the Python ML service was unavailable. Manual review is required.`
      };

      renderPrediction(fallback);

      await db().collection("claims").doc(generatedClaimId).update({
        ml_prediction: fallback,
        ml_error: mlError.message,
        status: "MANUAL_REVIEW",
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      });

      showMessage(
        `Claim ${generatedClaimId} was saved, but the ML service could not be reached. The claim has been routed to manual review.`,
        "warning"
      );
    }

    $("claimIdPreview").textContent = generatedClaimId;

  } catch (error) {
    console.error("[AssureX] Claim submission error:", error);
    showMessage(error.message || "Unable to submit the claim.", "error");
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Submit Claim & Analyze";
  }
}

function wireFileInputs() {
  [
    ["purchaseInvoice", "purchaseInvoiceName"],
    ["warrantyDocument", "warrantyDocumentName"],
    ["repairHistoryFile", "repairHistoryFileName"],
    ["productPhotos", "productPhotosName"]
  ].forEach(([input, output]) => {
    $(input).addEventListener("change", () => {
      updateFileName(input, output);
      runValidationChecks();
    });
  });
}

async function init() {
  generatedClaimId = makeClaimId();
  $("claimIdPreview").textContent = generatedClaimId;

  try {
    currentUser = await getCurrentUser();
    await loadCustomer(currentUser);
    await loadProducts(currentUser);

    $("authWarning").classList.add("hidden");
  } catch (error) {
    $("authWarning").textContent = error.message;
    $("authWarning").className = "alert warning";
    $("submitBtn").disabled = true;
  }

  $("productSelect").addEventListener("change", () => {
    const id = $("productSelect").value;
    const product = products.find(p => p.firestore_id === id);
    if (product) renderProduct(product);
    else {
      selectedProduct = null;
      $("productDetails").classList.add("hidden");
      runValidationChecks();
    }
  });

  $("hasRepairHistory").addEventListener("change", () => {
    $("repairFields").classList.toggle(
      "hidden",
      $("hasRepairHistory").value !== "Yes"
    );
  });

  wireFileInputs();

  $("claimForm").addEventListener("submit", submitClaim);

  [
    "faultType",
    "faultDate",
    "faultDescription",
    "hasRepairHistory",
    "authorizedRepair",
    "repairDate",
    "repairCenter",
    "replacedParts",
    "repairCost",
    "repairDetails"
  ].forEach(id => {
    $(id).addEventListener("input", runValidationChecks);
    $(id).addEventListener("change", runValidationChecks);
  });
}

document.addEventListener("DOMContentLoaded", init);
