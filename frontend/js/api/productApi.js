// Fetch all products
async function getAllProducts() {
    // API Configuration
    const API_BASE = "../../../backend/controllers";
    const API = {
        products: `${API_BASE}/ProductController.php`,
        auth:     `${API_BASE}/AuthController.php`,
    };

    try {
        console.log('Fetching from:', `${API.products}?action=all`);
        const res = await fetch(`${API.products}?action=all`);
        console.log('Response status:', res.status);
        const data = await res.json();
        console.log('Response data:', data);
        return data.success ? data.data : [];
    } catch (err) {
        console.error("getAllProducts error:", err);
        // Return dummy data for testing
        return [
            {
                id: 1,
                name: "Test Burger",
                description: "Test description",
                price: "10.99",
                category: "burger",
                image_url: "https://via.placeholder.com/400x300",
                rating: "4.5",
                delivery_time: "20 min",
                is_popular: 1,
                is_available: 1
            }
        ];
    }
}

// Fetch popular products only
async function getPopularProducts() {
    try {
        const res = await fetch(`${API.products}?action=popular`);
        const data = await res.json();
        return data.success ? data.data : [];
    } catch (err) {
        console.error("getPopularProducts error:", err);
        return [];
    }
}

// Fetch by category
async function getProductsByCategory(category) {
    try {
        const res = await fetch(`${API.products}?action=category&category=${category}`);
        const data = await res.json();
        return data.success ? data.data : [];
    } catch (err) {
        console.error("getProductsByCategory error:", err);
        return [];
    }
}

// Fetch single product
async function getProductById(id) {
    try {
        const res = await fetch(`${API.products}?action=single&id=${id}`);
        const data = await res.json();
        return data.success ? data.data : null;
    } catch (err) {
        console.error("getProductById error:", err);
        return null;
    }
}

// Search products
async function searchProducts(keyword) {
    try {
        const res = await fetch(`${API.products}?action=search&q=${encodeURIComponent(keyword)}`);
        const data = await res.json();
        return data.success ? data.data : [];
    } catch (err) {
        console.error("searchProducts error:", err);
        return [];
    }
}