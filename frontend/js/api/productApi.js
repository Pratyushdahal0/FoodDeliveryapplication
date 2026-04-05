// Fetch all products
async function getAllProducts() {
    try {
        const res = await fetch(`${API.products}?action=all`);
        const data = await res.json();
        return data.success ? data.data : [];
    } catch (err) {
        console.error("getAllProducts error:", err);
        return [];
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