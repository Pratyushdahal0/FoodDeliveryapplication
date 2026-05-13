const API_BASE = "../../backend/controllers";

const API = {
  products: `${API_BASE}/ProductController.php`,
  auth: `${API_BASE}/AuthController.php`,
  orders: `${API_BASE}/OrderController.php`
};

window.API = API;