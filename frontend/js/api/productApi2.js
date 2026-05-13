(function () {
  if (window.__FOODEXPRESS_PRODUCT_API2_LOADED__) {
    console.warn("[productApi2.js] Already loaded, skipping duplicate script.");
    return;
  }

  window.__FOODEXPRESS_PRODUCT_API2_LOADED__ = true;

  console.log("[productApi2.js] Loaded safely");

  const PRODUCT_API_BASE_SAFE = "../../backend/controllers";

  const PRODUCT_API_SAFE = {
    products: `${PRODUCT_API_BASE_SAFE}/ProductController.php`,
    auth: `${PRODUCT_API_BASE_SAFE}/AuthController.php`,
  };

  async function fetchProductJson(url) {
    const response = await fetch(url);
    const raw = await response.text();

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error("[productApi2.js] Non-JSON response:", raw);
      throw new Error("Product backend returned invalid JSON.");
    }
  }

  function normalizeProduct(product) {
    return {
      id: product.id,
      name: product.name || "Unnamed Item",
      description: product.description || "Freshly prepared item",
      price: Number(product.price || 0),
      category: product.category || "food",
      image_url:
        product.image_url ||
        product.image ||
        "https://placehold.co/400x300?text=FoodExpress",
      rating: product.rating || "4.5",
      delivery_time: product.delivery_time || "30 min",
      is_popular: Number(product.is_popular || 0),
      is_available: Number(product.is_available ?? 1),
      restaurant_id: product.restaurant_id || product.restaurantId || "",
      restaurant_name:
        product.restaurant_name ||
        product.restaurantName ||
        product.restaurant ||
        "Unknown Restaurant",
    };
  }

  async function getAllProducts() {
    try {
      const url = `${PRODUCT_API_SAFE.products}?action=all`;
      console.log("[productApi2.js] Fetching products from:", url);

      const data = await fetchProductJson(url);

      if (!data.success) {
        console.warn("[productApi2.js] Product API returned failure:", data);
        return [];
      }

      const products = Array.isArray(data.data) ? data.data : [];
      return products.map(normalizeProduct);
    } catch (err) {
      console.error("[productApi2.js] getAllProducts error:", err);

      return [
        {
          id: 1,
          name: "Test Burger",
          description: "Temporary fallback product",
          price: 349,
          category: "burger",
          image_url: "https://placehold.co/400x300?text=FoodExpress",
          rating: "4.5",
          delivery_time: "20 min",
          is_popular: 1,
          is_available: 1,
          restaurant_id: "1",
          restaurant_name: "Spicy Grill",
        },
      ];
    }
  }

  async function getPopularProducts() {
    try {
      const data = await fetchProductJson(
        `${PRODUCT_API_SAFE.products}?action=popular`
      );

      const products = data.success && Array.isArray(data.data) ? data.data : [];
      return products.map(normalizeProduct);
    } catch (err) {
      console.error("[productApi2.js] getPopularProducts error:", err);
      return [];
    }
  }

  async function getProductsByCategory(category) {
    try {
      const data = await fetchProductJson(
        `${PRODUCT_API_SAFE.products}?action=category&category=${encodeURIComponent(
          category
        )}`
      );

      const products = data.success && Array.isArray(data.data) ? data.data : [];
      return products.map(normalizeProduct);
    } catch (err) {
      console.error("[productApi2.js] getProductsByCategory error:", err);
      return [];
    }
  }

  async function getProductById(id) {
    try {
      const data = await fetchProductJson(
        `${PRODUCT_API_SAFE.products}?action=single&id=${encodeURIComponent(id)}`
      );

      return data.success && data.data ? normalizeProduct(data.data) : null;
    } catch (err) {
      console.error("[productApi2.js] getProductById error:", err);
      return null;
    }
  }

  async function searchProducts(keyword) {
    try {
      const data = await fetchProductJson(
        `${PRODUCT_API_SAFE.products}?action=search&q=${encodeURIComponent(
          keyword
        )}`
      );

      const products = data.success && Array.isArray(data.data) ? data.data : [];
      return products.map(normalizeProduct);
    } catch (err) {
      console.error("[productApi2.js] searchProducts error:", err);
      return [];
    }
  }

  window.getAllProducts = getAllProducts;
  window.getPopularProducts = getPopularProducts;
  window.getProductsByCategory = getProductsByCategory;
  window.getProductById = getProductById;
  window.searchProducts = searchProducts;
})();