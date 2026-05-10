/* ============================================================
   map.js – FoodRush Delivery Tracking
   ============================================================ */

"use strict";

/* ── Constants ── */
const RESTAURANT_COORDS = [27.7172, 85.3240]; // Kathmandu center (restaurant)
const DELIVERY_COORDS   = [27.7050, 85.3130]; // Customer location
const RIDER_START       = [27.7120, 85.3200]; // Rider start position

const RIDER_PATH = [
  [27.7120, 85.3200],
  [27.7110, 85.3185],
  [27.7095, 85.3165],
  [27.7080, 85.3150],
  [27.7065, 85.3140],
  [27.7050, 85.3130],
];

/* ── Map Init ── */
const map = L.map("map", {
  center: RIDER_START,
  zoom: 15,
  zoomControl: false,
  attributionControl: false,
});

// Dark tile layer
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
}).addTo(map);

/* ── Custom Icons ── */
function makeIcon(html) {
  return L.divIcon({ html, className: "", iconSize: [44, 44], iconAnchor: [22, 22] });
}

const riderIcon = makeIcon(`
  <div class="rider-marker-inner">
    <i class="fa fa-motorcycle" style="color:#fff;font-size:17px;"></i>
  </div>
`);

const restaurantIcon = makeIcon(`
  <div style="
    width:40px;height:40px;background:#ff9f1c;border:3px solid #fff;
    border-radius:50%;display:flex;align-items:center;justify-content:center;
    box-shadow:0 4px 16px rgba(255,159,28,0.5);">
    <i class="fa fa-store" style="color:#fff;font-size:15px;"></i>
  </div>
`);

const homeIcon = makeIcon(`
  <div style="
    width:40px;height:40px;background:#22c97a;border:3px solid #fff;
    border-radius:50%;display:flex;align-items:center;justify-content:center;
    box-shadow:0 4px 16px rgba(34,201,122,0.5);">
    <i class="fa fa-house" style="color:#fff;font-size:15px;"></i>
  </div>
`);

/* ── Place Markers ── */
const restaurantMarker = L.marker(RESTAURANT_COORDS, { icon: restaurantIcon }).addTo(map);
restaurantMarker.bindPopup(`
  <div style="font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.6;min-width:140px;">
    <strong style="color:#ff9f1c;">🍜 Momo Palace</strong><br/>
    Your order is ready!
  </div>
`);

const homeMarker = L.marker(DELIVERY_COORDS, { icon: homeIcon }).addTo(map);
homeMarker.bindPopup(`
  <div style="font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.6;min-width:140px;">
    <strong style="color:#22c97a;">📍 Your Location</strong><br/>
    Delivery destination
  </div>
`);

const riderMarker = L.marker(RIDER_START, { icon: riderIcon }).addTo(map);
riderMarker.bindPopup(`
  <div style="font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.6;min-width:140px;">
    <strong style="color:#ff5c35;">🏍 Rohan Thapa</strong><br/>
    On the way to you!
  </div>
`);

/* ── Dotted Route ── */
const routeLine = L.polyline(RIDER_PATH, {
  color: "#ff5c35",
  weight: 3,
  opacity: 0.7,
  dashArray: "8 6",
}).addTo(map);

/* ── Rider Animation ── */
let pathIndex = 0;
let etaMinutes = 12;

function animateRider() {
  if (pathIndex >= RIDER_PATH.length - 1) {
    clearInterval(riderTimer);
    riderMarker.setLatLng(DELIVERY_COORDS);
    document.getElementById("eta-label").innerHTML = "🎉 Delivered!";
    return;
  }

  pathIndex++;
  const newPos = RIDER_PATH[pathIndex];
  riderMarker.setLatLng(newPos);

  // Update visible route (trim visited)
  const remaining = RIDER_PATH.slice(pathIndex);
  routeLine.setLatLngs(remaining);

  // Update ETA
  etaMinutes = Math.max(1, 12 - pathIndex * 2);
  document.getElementById("eta-label").innerHTML =
    `Arriving in <strong>${etaMinutes} min</strong>`;

  // Pan map to rider
  map.panTo(newPos, { animate: true, duration: 0.8 });
}

const riderTimer = setInterval(animateRider, 3500);

/* ── Recenter Button ── */
document.getElementById("recenterBtn").addEventListener("click", () => {
  const pos = RIDER_PATH[pathIndex] || RIDER_START;
  map.flyTo(pos, 15, { animate: true, duration: 1.2 });
});

/* ── Order Summary Toggle ── */
const toggleBtn = document.getElementById("toggleSummary");
const summaryItems = document.getElementById("summaryItems");

toggleBtn.addEventListener("click", () => {
  const isOpen = !summaryItems.classList.contains("collapsed");
  summaryItems.classList.toggle("collapsed", isOpen);
  toggleBtn.classList.toggle("open", !isOpen);
});

/* ── Cancel Modal ── */
const cancelModal   = document.getElementById("cancelModal");
const cancelOrderBtn= document.getElementById("cancelOrderBtn");
const keepOrderBtn  = document.getElementById("keepOrderBtn");
const confirmCancel = document.getElementById("confirmCancelBtn");

cancelOrderBtn.addEventListener("click", () => {
  cancelModal.classList.add("open");
});
keepOrderBtn.addEventListener("click", () => {
  cancelModal.classList.remove("open");
});
confirmCancel.addEventListener("click", () => {
  cancelModal.classList.remove("open");
  clearInterval(riderTimer);
  document.getElementById("eta-label").innerHTML = "Order Cancelled";
  showToast("Order cancelled successfully.");
});
cancelModal.addEventListener("click", (e) => {
  if (e.target === cancelModal) cancelModal.classList.remove("open");
});

/* ── Toast Notification ── */
function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "30px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#ff5c35",
    color: "#fff",
    padding: "12px 22px",
    borderRadius: "30px",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "13px",
    fontWeight: "500",
    zIndex: "2000",
    boxShadow: "0 4px 20px rgba(255,92,53,0.4)",
    opacity: "0",
    transition: "opacity 0.3s ease",
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = "1"; });
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

/* ── Fetch Live Status from PHP API ── */
async function fetchOrderStatus() {
  try {
    const res = await fetch("map.php?action=order_status&order_id=FR-7842");
    if (!res.ok) return;
    const data = await res.json();

    if (data.status === "delivered") {
      clearInterval(riderTimer);
      document.getElementById("eta-label").innerHTML = "🎉 Delivered!";
    } else if (data.eta_minutes !== undefined) {
      document.getElementById("eta-label").innerHTML =
        `Arriving in <strong>${data.eta_minutes} min</strong>`;
    }

    // Update rider position from server if provided
    if (data.rider_lat && data.rider_lng) {
      riderMarker.setLatLng([data.rider_lat, data.rider_lng]);
      map.panTo([data.rider_lat, data.rider_lng], { animate: true });
    }
  } catch (err) {
    // Silent fail – demo mode continues with local animation
    console.warn("Server unreachable, running in demo mode.", err.message);
  }
}

// Poll every 10 seconds
fetchOrderStatus();
setInterval(fetchOrderStatus, 10000);

/* ── Keyboard Shortcuts ── */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cancelModal.classList.remove("open");
  if (e.key === "r" || e.key === "R") {
    map.flyTo(RIDER_PATH[pathIndex] || RIDER_START, 15, { animate: true, duration: 1 });
  }
});